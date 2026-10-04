import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "../scripts/validate-mock-data.mjs";
import { createMetricEngine } from "../src/lib/metrics.ts";
import { createExceptionEngine } from "../src/lib/exceptions.ts";
import { priorityItems, focusScope } from "../src/lib/priority-focus.ts";

const files = loadDataset();
const dataset = Object.fromEntries(
  ["metadata", "sessions", "generations", "devices"].map((key) => [
    key,
    files[`${key}.json`],
  ]),
);
const metrics = createMetricEngine(dataset);
const engine = createExceptionEngine(dataset, files["scenarios.json"]);
const filter = metrics.defaultFilter(7);

test("重点关注复用原始结果，排除数据提示、最多三项且不修改异常中心顺序", () => {
  const report = engine.evaluate(filter);
  const before = structuredClone(report);
  const focus = priorityItems(report.items);
  assert.deepEqual(
    focus.map((x) => x.scenario.scenario_id),
    ["device-offline", "moderation-backlog", "low-scan-conversion"],
  );
  assert.ok(focus.every((x) => report.items.includes(x)));
  assert.deepEqual(report, before);
  assert.deepEqual(priorityItems([...report.items].reverse()), focus);
});

test("点位、日期交集与无异常状态均来自现有引擎", () => {
  const [item] = priorityItems(
    engine.evaluate({ ...filter, locationId: "shanghai" }).items,
  );
  assert.equal(item.observed, 21 / 62);
  assert.match(focusScope(item), /实际失败 21 个任务.*62 个已结束任务/);
  const narrowed = priorityItems(
    engine.evaluate({
      locationId: "shanghai",
      startDate: "2026-10-03",
      endDate: "2026-10-03",
    }).items,
  );
  assert.equal(narrowed[0].filter.startDate, "2026-10-03");
  assert.equal(
    narrowed[0].records.length,
    narrowed[0].metrics.generation.failed,
  );
  assert.deepEqual(
    priorityItems(
      engine.evaluate({
        locationId: "shanghai",
        startDate: "2026-09-10",
        endDate: "2026-09-10",
      }).items,
    ),
    [],
  );
});

test("无业务覆盖与零体验不伪造业务异常，设备保留独立快照", () => {
  const outside = { ...filter, startDate: "2026-08-01", endDate: "2026-08-01" };
  assert.equal(metrics.calculate(outside).metrics, null);
  assert.deepEqual(
    priorityItems(engine.evaluate(outside).items).map(
      (x) => x.scenario.scenario_id,
    ),
    ["device-offline"],
  );
  assert.deepEqual(
    priorityItems(
      engine.evaluate({ ...outside, locationId: "shanghai" }).items,
    ),
    [],
  );
  const empty = {
    locationId: "chengdu",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
  };
  assert.equal(metrics.calculate(empty).metrics.sessions, 0);
  assert.ok(
    priorityItems(engine.evaluate(empty).items).every(
      (x) => x.scope === "snapshot",
    ),
  );
});

test("范围描述区分实际异常、均值样本和未扫码，避免扩大故障影响", () => {
  const items = engine.evaluate(filter).items;
  const get = (id) => items.find((x) => x.scenario.scenario_id === id);
  assert.match(
    focusScope(get("slow-generation")),
    /成功任务参与均值；不代表每个任务均超时/,
  );
  assert.match(
    focusScope(get("low-scan-conversion")),
    /94 个可领取任务，其中 91 个未扫码；不等于任务故障/,
  );
  assert.match(focusScope(get("moderation-blocks")), /实际拦截 21 个任务/);
  assert.match(focusScope(get("moderation-backlog")), /实际待审核 20 个任务/);
  assert.match(focusScope(get("device-offline")), /无法由心跳推断影响任务量/);
});
