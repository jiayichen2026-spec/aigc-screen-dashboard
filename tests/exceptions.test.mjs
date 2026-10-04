import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDataset,
  validateDataset,
} from "../scripts/validate-mock-data.mjs";
import { createMetricEngine } from "../src/lib/metrics.ts";
import {
  createExceptionEngine,
  parseScenarios,
} from "../src/lib/exceptions.ts";
import { loadExceptions } from "../src/lib/load-exceptions.ts";

const files = loadDataset();
const data = Object.fromEntries(
  ["metadata", "sessions", "generations", "devices"].map((name) => [
    name,
    files[`${name}.json`],
  ]),
);
const cases = files["scenarios.json"];
const metrics = createMetricEngine(data);
const engine = createExceptionEngine(data, cases);
const full = metrics.defaultFilter(30);
const last7 = metrics.defaultFilter(7);

test("30天九个案例的数值、分母与独立QA一致，默认7天仅七项", () => {
  const result = engine.evaluate(full);
  const qa = validateDataset(files).scenarios;
  assert.equal(result.items.length, 9);
  assert.equal(result.checked, 9);
  for (const item of result.items) {
    const expected = qa.find(
      (c) => c.scenario_id === item.scenario.scenario_id,
    );
    assert.equal(item.observed, expected.observed);
    assert.equal(item.denominator, expected.denominator);
  }
  assert.equal(engine.evaluate(last7).items.length, 7);
});

test("业务规则按案例窗口与日期交集复算，并保留关联证据", () => {
  const filter = {
    startDate: "2026-10-03",
    endDate: "2026-10-03",
    locationId: "shanghai",
  };
  const item = engine
    .evaluate(filter)
    .items.find((i) => i.scenario.scenario_id === "generation-timeout");
  assert.ok(item);
  const m = metrics.calculate(filter).metrics;
  assert.equal(item.observed, m.generation.failed / m.generation.ended);
  assert.equal(item.records.length, m.generation.failed);
  assert.equal(
    item.relatedVisitors,
    new Set(item.records.map((r) => r.session.visitor_id)).size,
  );
  assert.ok(
    item.records.every(
      (r) => r.job.status === "failed" && r.session.location_id === "shanghai",
    ),
  );
  assert.deepEqual(item.filter, filter);
});

test("筛选不到业务日期时仍展示设备快照，点位可以缩小设备范围", () => {
  const filter = {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    locationId: "all",
  };
  assert.deepEqual(
    engine.evaluate(filter).items.map((i) => i.scenario.scenario_id),
    ["device-offline", "device-unknown"],
  );
  const item = engine.evaluate({ ...filter, locationId: "beijing" }).items[0];
  assert.equal(item.observed, "unknown");
  assert.equal(item.relatedVisitors, null);
  assert.equal(item.device.last_heartbeat_at, null);
});

test("边界提示不充当故障，空记录与三次体验均可追查", () => {
  const list = engine.evaluate(full).items;
  const empty = list.find(
    (i) => i.scenario.scenario_id === "empty-location-day",
  );
  const small = list.find((i) => i.scenario.scenario_id === "small-sample");
  assert.equal(empty.scenario.kind, "boundary");
  assert.equal(empty.records.length, 0);
  assert.equal(empty.observed, 0);
  assert.equal(small.records.length, 3);
  assert.equal(small.scenario.kind, "boundary");
});

test("不同规则提供对应证据，扫码明细排除未展示及重复扫码会话", () => {
  const list = engine.evaluate(full).items;
  const scan = list.find(
    (i) => i.scenario.scenario_id === "low-scan-conversion",
  );
  assert.equal(scan.records.length, scan.denominator - scan.numerator);
  assert.ok(
    scan.records.every(
      (r) => r.job.result_displayed_at && r.job.scan_events.length === 0,
    ),
  );
  const slow = list.find((i) => i.scenario.scenario_id === "slow-generation");
  assert.equal(slow.records.length, slow.denominator);
  const blocked = list.find(
    (i) => i.scenario.scenario_id === "moderation-blocks",
  );
  assert.ok(
    blocked.records.every((r) => r.job.moderation_status === "blocked"),
  );
  const pending = list.find(
    (i) => i.scenario.scenario_id === "moderation-backlog",
  );
  assert.ok(
    pending.records.every((r) => r.job.moderation_status === "pending"),
  );
  assert.equal(pending.incomplete, true);
});

test("规则不依赖人为场景标签，输出与调用方修改不会污染下一次计算", () => {
  const copy = structuredClone(data);
  copy.sessions.forEach((s) => {
    s.scenario_ids = [];
    s.fixture_tags = [];
  });
  const independent = createExceptionEngine(copy, cases);
  assert.equal(independent.evaluate(full).items.length, 9);
  copy.sessions.length = 0;
  const result = independent.evaluate(full);
  result.items[0].records[0].job.status = "success";
  result.items[0].scenario.rule.threshold = 1;
  assert.equal(
    independent.evaluate(full).items[0].records[0].job.status,
    "failed",
  );
  assert.equal(
    independent.evaluate(full).items[0].scenario.rule.threshold,
    0.25,
  );
});

test("最小样本不足不判异常，零分母不作为0触发低比例规则", () => {
  const item = engine.evaluate(full).items[0];
  const increased = structuredClone(cases[0]);
  increased.rule.minimum_denominator = item.denominator + 1;
  const report = createExceptionEngine(data, [increased]).evaluate(full);
  assert.equal(report.items.length, 0);
  assert.equal(report.insufficient, 1);
  const empty = structuredClone(cases[2]);
  empty.selection = {
    location_id: "chengdu",
    start_date: "2026-09-05",
    end_date: "2026-09-05",
  };
  empty.rule.minimum_denominator = 0;
  assert.equal(
    createExceptionEngine(data, [empty]).evaluate(full).items.length,
    0,
  );
});

test("阈值比较保留精度，等号只属于大于等于分支", () => {
  const base = structuredClone(cases[0]);
  base.rule.threshold = engine.evaluate(full).items[0].observed;
  assert.equal(
    createExceptionEngine(data, [base]).evaluate(full).items.length,
    1,
  );
  base.rule.operator = "<";
  assert.equal(
    createExceptionEngine(data, [base]).evaluate(full).items.length,
    0,
  );
});

for (const [label, corrupt] of [
  ["重复ID", (c) => c.push(c[0])],
  ["未知点位", (c) => (c[0].selection.location_id = "missing")],
  ["错误设备", (c) => (c[5].selection.device_id = "beijing-02")],
  ["日期反向", (c) => (c[0].selection.start_date = "2026-10-04")],
  ["比例阈值错误", (c) => (c[0].rule.threshold = 25)],
  ["未知操作符", (c) => (c[0].rule.operator = "!=")],
  ["误称已确认根因", (c) => (c[0].root_cause_confirmed = true)],
  ["未知指标", (c) => (c[0].rule.metric = "purchase_rate")],
])
  test(`拒绝案例配置：${label}`, () => {
    const copy = structuredClone(cases);
    corrupt(copy);
    assert.throws(() => parseScenarios(copy, data));
  });

test("异常加载HTTP、HTML及坏规则失败；业务计算保持可用", async () => {
  for (const response of [
    new Response("", { status: 503 }),
    new Response("<html/>"),
    Response.json([{ bad: true }]),
  ]) {
    await assert.rejects(
      loadExceptions(data, new AbortController().signal, async () => response),
    );
    assert.equal(metrics.calculate(last7).metrics.participants, 857);
  }
  const e = await loadExceptions(data, new AbortController().signal, async () =>
    Response.json(cases),
  );
  assert.equal(e.evaluate(last7).items.length, 7);
});
