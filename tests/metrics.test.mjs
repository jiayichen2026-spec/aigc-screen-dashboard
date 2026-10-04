import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  loadDataset,
  summarizeRecords,
} from "../scripts/validate-mock-data.mjs";
import {
  createMetricEngine,
  defaultMetricFilter,
  MetricInputError,
  shanghaiDayStart,
  toShanghaiDate,
} from "../src/lib/metrics.ts";
import {
  formatCount,
  formatPercent,
  formatSeconds,
} from "../src/lib/metric-format.ts";

const files = loadDataset();
const live = {
  metadata: files["metadata.json"],
  sessions: files["sessions.json"],
  generations: files["generations.json"],
  devices: files["devices.json"],
};
const fullFilter = {
  startDate: "2026-09-05",
  endDate: "2026-10-04",
  locationId: "all",
};
const engine = createMetricEngine(live);
const referenceFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const referenceDate = (value) => {
  const parts = referenceFormatter.formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key).value)
    .join("-");
};

function sameReference(actual, reference) {
  assert.equal(actual.participants, reference.participant_count);
  assert.equal(actual.sessions, reference.session_count);
  assert.equal(actual.generation.submitted, reference.task_count);
  assert.equal(actual.generation.succeeded, reference.success_count);
  assert.equal(actual.generation.failed, reference.failure_count);
  assert.equal(actual.generation.ended, reference.ended_task_count);
  assert.equal(actual.generation.queued, reference.queued_count);
  assert.equal(actual.generation.processing, reference.processing_count);
  assert.equal(
    actual.generation.successRate,
    reference.generation_success_rate,
  );
  assert.equal(
    actual.generation.averageSeconds,
    reference.average_success_duration_seconds,
  );
  assert.equal(actual.conversion.rate, reference.scan_conversion_rate);
  assert.equal(
    actual.conversion.eligibleSessions,
    reference.displayed_session_count,
  );
  assert.equal(
    actual.conversion.scannedSessions,
    reference.scanned_session_count,
  );
  assert.equal(actual.conversion.scanEvents, reference.scan_event_count);
  assert.equal(actual.moderation.passed, reference.moderation_passed_count);
  assert.equal(actual.moderation.blocked, reference.moderation_blocked_count);
  assert.equal(actual.moderation.pending, reference.moderation_pending_count);
  assert.equal(actual.moderation.reviewed, reference.moderation_reviewed_count);
  assert.equal(actual.moderation.passRate, reference.moderation_pass_rate);
}

function sampleSession(id, location, date, visitor = id) {
  return {
    session_id: id,
    visitor_id: visitor,
    location_id: location,
    device_id: `${location}-01`,
    started_at: new Date(date).toISOString(),
    scenario_ids: [],
    fixture_tags: [],
  };
}

function sampleJob(session, options = {}) {
  const submitted = Date.parse(session.started_at) + 1000;
  const status = options.status ?? "success";
  const ended = status === "success" || status === "failed";
  const duration = (options.seconds ?? 10) * 1000;
  const completed = submitted + duration;
  const moderation =
    status === "success" ? (options.moderation ?? "passed") : "not_applicable";
  const reviewed = moderation === "passed" || moderation === "blocked";
  const displayed = moderation === "passed" && options.display !== false;
  const iso = (time) => new Date(time).toISOString();
  return {
    generation_id: `job-${session.session_id}`,
    session_id: session.session_id,
    submitted_at: iso(submitted),
    completed_at: ended ? iso(completed) : null,
    status,
    duration_ms: ended ? duration : null,
    failure_code: status === "failed" ? "GENERATION_TIMEOUT" : null,
    attempts:
      status === "queued"
        ? []
        : [
            {
              attempt_id: `attempt-${session.session_id}`,
              started_at: iso(submitted + 500),
              ended_at: ended ? iso(completed) : null,
              status,
              failure_code: status === "failed" ? "GENERATION_TIMEOUT" : null,
            },
          ],
    moderation_status: moderation,
    reviewed_at: reviewed ? iso(completed + 1000) : null,
    moderation_reason: moderation === "blocked" ? "UNSAFE_CONTENT" : null,
    result_displayed_at: displayed ? iso(completed + 2000) : null,
    scan_events: Array.from({ length: options.scans ?? 0 }, (_, i) => ({
      scan_event_id: `scan-${session.session_id}-${i}`,
      scanned_at: iso(completed + 3000 + i * 1000),
    })),
  };
}

function fixture(sessions, generations) {
  return {
    metadata: structuredClone(live.metadata),
    devices: structuredClone(live.devices),
    sessions,
    generations,
  };
}

function manualFixture() {
  const sessions = [
    sampleSession("s1", "shanghai", "2026-10-01T10:00:00+08:00", "u1"),
    sampleSession("s2", "shanghai", "2026-10-01T11:00:00+08:00", "u1"),
    sampleSession("s3", "beijing", "2026-10-01T12:00:00+08:00", "u1"),
    sampleSession("s4", "beijing", "2026-10-02T12:00:00+08:00", "u1"),
    sampleSession("s5", "shanghai", "2026-10-02T13:00:00+08:00", "u3"),
    sampleSession("s6", "shanghai", "2026-10-02T14:00:00+08:00", "u4"),
    sampleSession("s7", "shanghai", "2026-10-04T17:59:00+08:00", "u5"),
    sampleSession("s8", "beijing", "2026-10-04T17:59:00+08:00", "u6"),
    sampleSession("s9", "beijing", "2026-10-01T14:00:00+08:00", "u7"),
  ];
  const generations = [
    sampleJob(sessions[0], { seconds: 10, scans: 3 }),
    sampleJob(sessions[1], { status: "failed", seconds: 80 }),
    sampleJob(sessions[2], { seconds: 30, moderation: "blocked" }),
    sampleJob(sessions[3], { seconds: 20, display: false }),
    sampleJob(sessions[4], { seconds: 40 }),
    sampleJob(sessions[5], { seconds: 50, moderation: "pending" }),
    sampleJob(sessions[6], { status: "queued" }),
    sampleJob(sessions[7], { status: "processing" }),
  ];
  const first = generations[0];
  first.attempts = [
    {
      attempt_id: "a1",
      started_at: first.submitted_at,
      ended_at: new Date(Date.parse(first.submitted_at) + 3000).toISOString(),
      status: "failed",
      failure_code: "SERVICE_UNAVAILABLE",
    },
    {
      attempt_id: "a2",
      started_at: new Date(Date.parse(first.submitted_at) + 4000).toISOString(),
      ended_at: first.completed_at,
      status: "success",
      failure_code: null,
    },
  ];
  return fixture(sessions, generations);
}

test("全量结果与第四步独立QA汇总逐字段一致", () => {
  const result = engine.calculate(fullFilter);
  sameReference(
    result.metrics,
    summarizeRecords(live.sessions, live.generations),
  );
  assert.equal(result.metrics.participants, 3100);
  assert.equal(result.metrics.generation.succeeded, 3285);
  assert.equal(result.metrics.conversion.scannedSessions, 1248);
  assert.equal(result.metrics.conversion.scanEvents, 1368);
  assert.equal(result.daily.length, 30);
  assert.deepEqual(result.coverage.incompleteDates, ["2026-10-04"]);
});

test("30天×5个点位选项的筛选与独立QA均一致", () => {
  for (const locationId of [
    "all",
    ...live.metadata.locations.map((site) => site.id),
  ]) {
    for (const day of engine.calculate(fullFilter).daily) {
      const result = engine.calculate({
        startDate: day.date,
        endDate: day.date,
        locationId,
      });
      const selected = live.sessions.filter(
        (session) =>
          referenceDate(session.started_at) === day.date &&
          (locationId === "all" || session.location_id === locationId),
      );
      sameReference(
        result.metrics,
        summarizeRecords(selected, live.generations),
      );
      assert.deepEqual(
        new Set(result.recordIds.sessions),
        new Set(selected.map((session) => session.session_id)),
      );
    }
  }
});

test("手算样本：去重、内部重试、未完成任务与未提交体验", () => {
  const result = createMetricEngine(manualFixture()).calculate(fullFilter);
  const m = result.metrics;
  assert.equal(m.sessions, 9);
  assert.equal(m.participants, 6);
  assert.deepEqual(m.generation, {
    submitted: 8,
    succeeded: 5,
    failed: 1,
    queued: 1,
    processing: 1,
    ended: 6,
    successRate: 5 / 6,
    successfulDurationMs: 150000,
    averageSeconds: 30,
  });
  assert.deepEqual(m.conversion, {
    eligibleSessions: 2,
    scannedSessions: 1,
    scanEvents: 3,
    rate: 0.5,
  });
  assert.deepEqual(m.moderation, {
    passed: 3,
    blocked: 1,
    pending: 1,
    notApplicable: 3,
    reviewed: 4,
    passRate: 0.75,
  });
  const sites = result.locations.filter((site) => site.metrics.sessions > 0);
  assert.notEqual(
    m.participants,
    sites.reduce((total, site) => total + site.metrics.participants, 0),
  );
  assert.notEqual(
    m.participants,
    result.daily.reduce((total, day) => total + day.metrics.participants, 0),
  );
  assert.notEqual(
    m.generation.successRate,
    sites.reduce(
      (total, site) => total + site.metrics.generation.successRate,
      0,
    ) / sites.length,
  );
  assert.notEqual(
    m.generation.averageSeconds,
    sites.reduce(
      (total, site) => total + site.metrics.generation.averageSeconds,
      0,
    ) / sites.length,
  );
});

test("北京时间午夜边界与跨日生成/扫码仍归属体验开始日", () => {
  const sessions = [
    sampleSession("before", "shanghai", "2026-09-30T15:59:58Z"),
    sampleSession("boundary", "shanghai", "2026-09-30T16:00:00Z"),
    sampleSession("next-day", "shanghai", "2026-10-01T16:00:00Z"),
  ];
  const localEngine = createMetricEngine(
    fixture(
      sessions,
      sessions.map((session) => sampleJob(session, { scans: 1 })),
    ),
  );
  for (const [date, id] of [
    ["2026-09-30", "before"],
    ["2026-10-01", "boundary"],
    ["2026-10-02", "next-day"],
  ]) {
    const result = localEngine.calculate({
      startDate: date,
      endDate: date,
      locationId: "all",
    });
    assert.deepEqual(result.recordIds.sessions, [id]);
    assert.equal(result.metrics.conversion.rate, 1);
  }
});

test("零记录与未覆盖日期分开处理，趋势缺失日不会被省略", () => {
  const empty = engine.calculate({
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    locationId: "chengdu",
  });
  assert.equal(empty.metrics.sessions, 0);
  assert.equal(empty.metrics.participants, 0);
  assert.equal(empty.metrics.generation.successRate, null);
  assert.equal(empty.metrics.generation.averageSeconds, null);
  assert.equal(empty.metrics.conversion.rate, null);
  assert.equal(empty.metrics.moderation.passRate, null);
  assert.equal(empty.daily[0].coverage, "complete");
  const outside = engine.calculate({
    startDate: "2026-09-04",
    endDate: "2026-09-04",
    locationId: "chengdu",
  });
  assert.equal(outside.metrics, null);
  assert.equal(outside.coverage.dateRange, "outside");
  assert.equal(outside.daily[0].coverage, "unavailable");
  assert.equal(outside.devices.total, 2);
  const overlap = engine.calculate({
    startDate: "2026-09-04",
    endDate: "2026-09-06",
    locationId: "chengdu",
  });
  assert.equal(overlap.coverage.dateRange, "partial");
  assert.equal(overlap.daily.length, 3);
  assert.equal(overlap.daily[0].metrics, null);
  assert.equal(overlap.daily[1].metrics.sessions, 0);
});

test("全失败为0%成功率，平均成功耗时与审核通过率仍为空", () => {
  const session = sampleSession("failed", "shanghai", "2026-10-01T08:00:00Z");
  const result = createMetricEngine(
    fixture([session], [sampleJob(session, { status: "failed" })]),
  ).calculate(fullFilter).metrics;
  assert.equal(result.generation.successRate, 0);
  assert.equal(result.generation.averageSeconds, null);
  assert.equal(result.moderation.passRate, null);
});

test("全部审核拦截和全部待审核分别处理，不进入扫码分母", () => {
  for (const moderation of ["blocked", "pending"]) {
    const session = sampleSession(
      moderation,
      "shanghai",
      "2026-10-01T08:00:00Z",
    );
    const m = createMetricEngine(
      fixture([session], [sampleJob(session, { moderation })]),
    ).calculate(fullFilter).metrics;
    assert.equal(m.generation.successRate, 1);
    assert.equal(m.moderation.passRate, moderation === "blocked" ? 0 : null);
    assert.equal(m.conversion.eligibleSessions, 0);
    assert.equal(m.conversion.rate, null);
  }
});

test("设备只受点位筛选影响，未知独立显示，不跟随业务日期", () => {
  const all = engine.calculate(fullFilter).devices;
  assert.equal(all.online, 6);
  assert.equal(all.offline, 1);
  assert.equal(all.unknown, 1);
  assert.deepEqual(
    engine.calculate({
      ...fullFilter,
      startDate: "2026-09-05",
      endDate: "2026-09-05",
    }).devices,
    all,
  );
  const beijing = engine.calculate({ ...fullFilter, locationId: "beijing" });
  assert.equal(beijing.devices.total, 2);
  assert.equal(beijing.devices.unknown, 1);
  assert.equal(beijing.locations.length, 1);
  assert.equal(
    beijing.devices.items.find((device) => device.status === "unknown")
      .heartbeatAgeSeconds,
    null,
  );
});

test("心跳恰好5分钟仍在线，超过1毫秒离线", () => {
  const copy = structuredClone(live);
  const now = Date.parse(copy.metadata.snapshot_at);
  copy.devices[0].last_heartbeat_at = new Date(now - 300000).toISOString();
  copy.devices[1].last_heartbeat_at = new Date(now - 300001).toISOString();
  const snapshot = createMetricEngine(copy).calculate(fullFilter).devices;
  assert.equal(snapshot.items[0].status, "online");
  assert.equal(snapshot.items[1].status, "offline");
});

test("默认7/30天锚定模拟快照，不跟随系统今天", () => {
  assert.deepEqual(engine.defaultFilter(), {
    startDate: "2026-09-28",
    endDate: "2026-10-04",
    locationId: "all",
  });
  assert.deepEqual(engine.defaultFilter(30), fullFilter);
  assert.equal(engine.defaultFilter(60).startDate, "2026-09-05");
  for (const days of [0, -1, 2.5, 367])
    assert.throws(
      () => defaultMetricFilter(live.metadata, days),
      MetricInputError,
    );
});

test("三个系统时区下计算结果完全一致", () => {
  const code = `import {loadDataset} from './scripts/validate-mock-data.mjs'; import {createMetricEngine} from './src/lib/metrics.ts'; const f=loadDataset(); const e=createMetricEngine({metadata:f['metadata.json'],sessions:f['sessions.json'],generations:f['generations.json'],devices:f['devices.json']}); console.log(JSON.stringify(e.calculate(e.defaultFilter())));`;
  let expected;
  for (const TZ of ["UTC", "America/New_York", "Asia/Shanghai"]) {
    const run = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, TZ },
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    if (expected === undefined) expected = run.stdout;
    else assert.equal(run.stdout, expected);
  }
});

test("不修改调用方数据，且计算器不受随后外部修改影响", () => {
  const copy = structuredClone(live);
  const original = structuredClone(copy);
  const isolated = createMetricEngine(copy);
  const before = isolated.calculate(fullFilter);
  assert.deepEqual(copy, original);
  copy.sessions.length = 0;
  copy.metadata.locations[0].name = "changed";
  const returned = isolated.calculate(fullFilter);
  returned.locations[0].name = "changed-output";
  returned.devices.items[0].name = "changed-device";
  assert.deepEqual(isolated.calculate(fullFilter), before);
});

test("无效日期、反向区间、未知点位与超长范围明确报错", () => {
  for (const date of ["2026-02-30", "2026-2-01", "not-a-date", "2026-13-01"])
    assert.throws(() => shanghaiDayStart(date), MetricInputError);
  assert.equal(toShanghaiDate("2026-09-30T16:00:00Z"), "2026-10-01");
  assert.throws(
    () => engine.calculate({ ...fullFilter, startDate: "2026-10-05" }),
    /开始日期/,
  );
  assert.throws(
    () => engine.calculate({ ...fullFilter, locationId: "typo" }),
    /未知点位/,
  );
  assert.throws(
    () => engine.calculate({ ...fullFilter, startDate: "2020-01-01" }),
    /366天/,
  );
});

const brokenInputs = [
  [
    "孤立任务",
    (d) => {
      d.generations[0].session_id = "missing";
    },
    /关联不存在/,
  ],
  [
    "重复体验ID",
    (d) => {
      d.sessions.push(d.sessions[0]);
    },
    /ID缺失或重复/,
  ],
  [
    "一个会话多个逻辑任务",
    (d) => {
      d.generations[1].session_id = d.generations[0].session_id;
    },
    /多个逻辑任务/,
  ],
  [
    "未来结果",
    (d) => {
      d.generations[0].completed_at = "2027-01-01T00:00:00Z";
    },
    /超过快照/,
  ],
  [
    "未来心跳",
    (d) => {
      d.devices[0].last_heartbeat_at = "2027-01-01T00:00:00Z";
    },
    /超过快照/,
  ],
  [
    "耗时不一致",
    (d) => {
      d.generations[0].duration_ms++;
    },
    /耗时与/,
  ],
  [
    "审核拦截后展示",
    (d) => {
      const j = d.generations.find((g) => g.moderation_status === "blocked");
      j.result_displayed_at = j.reviewed_at;
    },
    /不可领取/,
  ],
  [
    "没有展示却扫码",
    (d) => {
      d.generations.find((g) => g.scan_events.length).result_displayed_at =
        null;
    },
    /缺少可领取/,
  ],
  [
    "未知数据契约",
    (d) => {
      d.metadata.schema_version = "2.0.0";
    },
    /数据版本/,
  ],
  [
    "更改设备日期口径",
    (d) => {
      d.metadata.device_filter_scope = "date_and_location";
    },
    /设备指标口径/,
  ],
];
for (const [name, mutate, pattern] of brokenInputs)
  test(`错误数据${name}不会被默默计算`, () => {
    const copy = structuredClone(live);
    mutate(copy);
    assert.throws(() => createMetricEngine(copy), pattern);
  });

test("显示格式最后才舍入；0与缺失值明确区分", () => {
  assert.equal(formatCount(3100), "3,100");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(null), "—");
  assert.equal(formatPercent(3285 / 3453), "95.13");
  assert.equal(formatPercent(0), "0.00");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatSeconds(21.996042617960427), "22.00");
  assert.equal(formatSeconds(null), "—");
  for (const invalid of [NaN, Infinity, -1])
    assert.throws(() => formatSeconds(invalid), MetricInputError);
  assert.throws(() => formatCount(1.5), MetricInputError);
  assert.throws(() => formatPercent(1.1), MetricInputError);
});
