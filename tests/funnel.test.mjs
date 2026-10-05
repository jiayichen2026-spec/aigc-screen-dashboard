import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "../scripts/validate-mock-data.mjs";
import { createMetricEngine } from "../src/lib/metrics.ts";
import { calculateFunnel } from "../src/lib/funnel.ts";

const files = loadDataset();
const data = Object.fromEntries(
  ["metadata", "sessions", "generations", "devices"].map((k) => [
    k,
    files[`${k}.json`],
  ]),
);
const engine = createMetricEngine(data);
const jobs = new Map(data.generations.map((j) => [j.session_id, j]));
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
});
const dateCache = new Map();
const day = (t) => {
  if (!dateCache.has(t)) dateCache.set(t, dateFormatter.format(new Date(t)));
  return dateCache.get(t);
};

function reconcile(stages) {
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    assert.equal(s.count, new Set(s.sessionIds).size);
    if (i === 0) {
      assert.equal(s.previousCount, null);
      assert.equal(s.conversionRate, null);
      assert.equal(s.difference, null);
      continue;
    }
    const prev = new Set(stages[i - 1].sessionIds);
    assert.ok(s.sessionIds.every((id) => prev.has(id)));
    assert.equal(s.previousCount, prev.size);
    assert.equal(s.conversionRate, prev.size ? s.count / prev.size : null);
    const missing = s.breakdown.flatMap((group) => {
      assert.equal(group.count, group.sessionIds.length);
      return group.sessionIds;
    });
    assert.equal(new Set(missing).size, missing.length);
    assert.equal(missing.length, s.difference);
    assert.equal(s.count + missing.length, prev.size);
    assert.deepEqual(new Set([...s.sessionIds, ...missing]), prev);
  }
}

test("默认漏斗与KPI计数可核对，阶段转化分母包含尚未完成状态", () => {
  const result = engine.calculate(engine.defaultFilter(7));
  const s = result.funnel;
  assert.deepEqual(
    s.map((x) => x.count),
    [878, 825, 782, 719, 692, 269],
  );
  assert.deepEqual(
    s.map((x) => x.difference),
    [null, 53, 43, 63, 27, 423],
  );
  assert.deepEqual(
    s[2].breakdown.map((x) => x.count),
    [41, 1, 1],
  );
  assert.deepEqual(
    s[3].breakdown.map((x) => x.count),
    [43, 20],
  );
  assert.equal(s[2].conversionRate, 782 / 825);
  assert.notEqual(s[2].conversionRate, result.metrics.generation.successRate);
  assert.equal(s[3].conversionRate, 719 / 782);
  assert.notEqual(s[3].conversionRate, result.metrics.moderation.passRate);
  assert.equal(s[5].conversionRate, result.metrics.conversion.rate);
  reconcile(s);
});

test("单点位、单日期、组合及部分覆盖：与独立筛选明细的体验集合一致", () => {
  const filters = data.metadata.locations.map((site) => ({
    ...engine.defaultFilter(7),
    locationId: site.id,
  }));
  for (let n = 0; n < 30; n++) {
    const date = new Date(Date.UTC(2026, 8, 5 + n)).toISOString().slice(0, 10);
    for (const locationId of [
      "all",
      ...data.metadata.locations.map((s) => s.id),
    ])
      filters.push({ startDate: date, endDate: date, locationId });
  }
  filters.push({
    startDate: "2026-09-01",
    endDate: "2026-09-06",
    locationId: "all",
  });
  for (const filter of filters) {
    const result = engine.calculate(filter);
    const sessions = data.sessions.filter(
      (s) =>
        day(s.started_at) >= filter.startDate &&
        day(s.started_at) <= filter.endDate &&
        (filter.locationId === "all" || s.location_id === filter.locationId),
    );
    const predicates = [
      () => true,
      (j) => !!j,
      (j) => j?.status === "success",
      (j) => j?.moderation_status === "passed",
      (j) => !!j?.result_displayed_at,
      (j) => !!j?.scan_events.length,
    ];
    predicates.forEach((predicate, i) =>
      assert.deepEqual(
        new Set(result.funnel[i].sessionIds),
        new Set(
          sessions
            .filter((s) => predicate(jobs.get(s.session_id)))
            .map((s) => s.session_id),
        ),
      ),
    );
    reconcile(result.funnel);
  }
});

test("无数据不同于零体验；零分母为null，不伪造百分比", () => {
  const outside = engine.calculate({
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    locationId: "all",
  });
  assert.equal(outside.funnel, null);
  const empty = engine.calculate({
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    locationId: "chengdu",
  });
  assert.deepEqual(
    empty.funnel.map((s) => s.count),
    [0, 0, 0, 0, 0, 0],
  );
  assert.ok(empty.funnel.every((s) => s.conversionRate === null));
  reconcile(empty.funnel);
  const noJob = data.sessions.find((s) => !jobs.has(s.session_id));
  const tiny = createMetricEngine({
    ...data,
    sessions: [noJob],
    generations: [],
  });
  const s = tiny.calculate(tiny.defaultFilter(30)).funnel;
  assert.deepEqual(
    s.map((x) => x.count),
    [1, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    s.map((x) => x.conversionRate),
    [null, 0, null, null, null, null],
  );
  reconcile(s);
});

test("同一用户多次体验分别计数；内部重试和重复扫码只算一次", () => {
  const retry = data.generations.find(
    (j) =>
      j.status === "success" &&
      j.attempts.length > 1 &&
      j.scan_events.length > 0,
  );
  assert.ok(retry);
  const scanned = structuredClone(retry);
  scanned.scan_events.push({
    ...scanned.scan_events[0],
    scan_event_id: "test-extra-scan",
  });
  const other = data.sessions.find((s) => !jobs.has(s.session_id));
  const first = data.sessions.find((s) => s.session_id === retry.session_id);
  const fixture = {
    ...data,
    sessions: [first, { ...other, visitor_id: first.visitor_id }],
    generations: [scanned],
  };
  const local = createMetricEngine(fixture);
  const result = local.calculate(local.defaultFilter(30));
  assert.equal(result.metrics.participants, 1);
  assert.deepEqual(
    result.funnel.map((s) => s.count),
    [2, 1, 1, 1, 1, 1],
  );
  assert.ok(scanned.attempts.length > 1 && scanned.scan_events.length > 1);
  reconcile(result.funnel);
});

test("跨日后续事件按体验开始日入漏斗，统一取快照内已完成状态", () => {
  // The shipped data has no midnight scans. Shift a test-only copy, never the JSON fixtures.
  const job = structuredClone(
    data.generations.find((j) => j.scan_events.length > 0),
  );
  const session = structuredClone(
    data.sessions.find((s) => s.session_id === job.session_id),
  );
  const delta =
    Date.parse("2026-10-01T15:59:59.000Z") - Date.parse(session.started_at);
  const shift = (value) =>
    value === null ? null : new Date(Date.parse(value) + delta).toISOString();
  session.started_at = shift(session.started_at);
  for (const key of [
    "submitted_at",
    "completed_at",
    "reviewed_at",
    "result_displayed_at",
  ])
    job[key] = shift(job[key]);
  for (const attempt of job.attempts) {
    attempt.started_at = shift(attempt.started_at);
    attempt.ended_at = shift(attempt.ended_at);
  }
  for (const scan of job.scan_events) scan.scanned_at = shift(scan.scanned_at);
  assert.notEqual(day(job.scan_events[0].scanned_at), day(session.started_at));
  const local = createMetricEngine({
    ...data,
    sessions: [session],
    generations: [job],
  });
  const d = day(session.started_at);
  const result = local.calculate({
    startDate: d,
    endDate: d,
    locationId: session.location_id,
  });
  assert.ok(
    result.funnel.every((s) => s.sessionIds.includes(session.session_id)),
  );
  assert.equal(result.coverage.observedThrough, data.metadata.snapshot_at);
});

test("不一致关联、后续阶段缺失前序和快照后的事件明确报错，不能截断掩盖", () => {
  const original = data.generations.find((j) => j.scan_events.length > 0);
  const session = data.sessions.find(
    (s) => s.session_id === original.session_id,
  );
  for (const modify of [
    (j) => {
      j.moderation_status = "blocked";
    },
    (j) => {
      j.result_displayed_at = null;
    },
    (j) => {
      j.scan_events[0].scanned_at = "2026-10-05T00:00:00.000Z";
    },
    (j) => {
      j.session_id = "missing-session";
    },
  ]) {
    const job = structuredClone(original);
    modify(job);
    assert.throws(() =>
      createMetricEngine({ ...data, sessions: [session], generations: [job] }),
    );
  }
  assert.throws(
    () =>
      createMetricEngine({
        ...data,
        sessions: [session],
        generations: [
          original,
          { ...original, generation_id: "duplicate-logical-job" },
        ],
      }),
    /一个体验对应多个逻辑任务/,
  );
  assert.throws(
    () =>
      calculateFunnel(
        [session],
        new Map([
          [session.session_id, { ...original, moderation_status: "blocked" }],
        ]),
      ),
    /漏斗关系不一致/,
  );
});

test("差额分类保留待处理状态；返回的体验集合不能污染下一次计算", () => {
  const filter = engine.defaultFilter(7);
  const before = engine.calculate(filter).funnel;
  assert.deepEqual(
    before[2].breakdown.map((x) => x.label),
    ["生成失败", "排队中", "处理中"],
  );
  assert.deepEqual(
    before[3].breakdown.map((x) => x.label),
    ["审核拦截", "待审核"],
  );
  assert.ok(
    [before[1], before[4], before[5]].every((s) =>
      s.breakdown[0].label.includes("原因未知"),
    ),
  );
  const result = engine.calculate(filter).funnel;
  result[0].sessionIds.length = 0;
  result[2].breakdown[0].sessionIds.length = 0;
  assert.deepEqual(engine.calculate(filter).funnel, before);
});
