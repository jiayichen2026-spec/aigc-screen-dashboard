import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locations } from "../src/data/catalog.ts";
import { DEFAULT_OUTPUT } from "./generate-mock-data.mjs";

const FILES = [
  "metadata.json",
  "sessions.json",
  "generations.json",
  "devices.json",
  "scenarios.json",
];
const dateInShanghai = (value) =>
  new Date(Date.parse(value) + 8 * 3_600_000).toISOString().slice(0, 10);
const check = (condition, message) => assert.ok(condition, message);
const ratio = (numerator, denominator) =>
  denominator === 0 ? null : numerator / denominator;

// QA-only reference aggregation. The application has not yet integrated metrics.
export function summarizeRecords(sessions, generations) {
  const ids = new Set(sessions.map((record) => record.session_id));
  const jobs = generations.filter((job) => ids.has(job.session_id));
  const succeeded = jobs.filter((job) => job.status === "success");
  const failed = jobs.filter((job) => job.status === "failed");
  const reviewed = succeeded.filter((job) =>
    ["passed", "blocked"].includes(job.moderation_status),
  );
  const passed = reviewed.filter((job) => job.moderation_status === "passed");
  const displayed = new Set(
    jobs
      .filter((job) => job.result_displayed_at !== null)
      .map((job) => job.session_id),
  );
  const scanned = new Set(
    jobs
      .filter((job) => job.scan_events.length > 0)
      .map((job) => job.session_id),
  );
  const duration = succeeded.reduce(
    (total, job) =>
      total + Date.parse(job.completed_at) - Date.parse(job.submitted_at),
    0,
  );
  return {
    session_count: sessions.length,
    participant_count: new Set(sessions.map((record) => record.visitor_id))
      .size,
    task_count: jobs.length,
    success_count: succeeded.length,
    failure_count: failed.length,
    ended_task_count: succeeded.length + failed.length,
    queued_count: jobs.filter((job) => job.status === "queued").length,
    processing_count: jobs.filter((job) => job.status === "processing").length,
    generation_success_rate: ratio(
      succeeded.length,
      succeeded.length + failed.length,
    ),
    generation_failure_rate: ratio(
      failed.length,
      succeeded.length + failed.length,
    ),
    average_success_duration_seconds: ratio(duration / 1000, succeeded.length),
    displayed_session_count: displayed.size,
    scanned_session_count: scanned.size,
    scan_event_count: jobs.reduce(
      (total, job) => total + job.scan_events.length,
      0,
    ),
    scan_conversion_rate: ratio(scanned.size, displayed.size),
    moderation_reviewed_count: reviewed.length,
    moderation_passed_count: passed.length,
    moderation_blocked_count: reviewed.length - passed.length,
    moderation_pending_count: succeeded.filter(
      (job) => job.moderation_status === "pending",
    ).length,
    moderation_pass_rate: ratio(passed.length, reviewed.length),
    moderation_block_rate: ratio(
      reviewed.length - passed.length,
      reviewed.length,
    ),
  };
}

export function deviceStatus(device, metadata) {
  if (device.last_heartbeat_at === null) return "unknown";
  return Date.parse(metadata.snapshot_at) -
    Date.parse(device.last_heartbeat_at) <=
    metadata.online_threshold_seconds * 1000
    ? "online"
    : "offline";
}

export function validateDataset(data) {
  for (const file of FILES)
    check(Object.hasOwn(data, file), `缺少文件 ${file}`);
  const metadata = data["metadata.json"];
  const sessions = data["sessions.json"];
  const generations = data["generations.json"];
  const devices = data["devices.json"];
  const scenarios = data["scenarios.json"];
  for (const value of [sessions, generations, devices, scenarios])
    check(Array.isArray(value), "明细文件必须为数组");
  assert.equal(metadata.schema_version, "1.0.0");
  assert.equal(metadata.timezone, "Asia/Shanghai");
  assert.equal(metadata.utc_offset, "+08:00");
  assert.equal(metadata.date_attribution, "session_started_at");
  assert.equal(metadata.status_as_of, "snapshot_at");
  assert.equal(metadata.device_filter_scope, "location_only");
  assert.equal(
    metadata.generation_granularity,
    "one_logical_task_per_session_with_internal_attempts",
  );
  assert.equal(metadata.data_origin, "synthetic");
  check(
    Number.isInteger(metadata.seed) &&
      metadata.seed >= 0 &&
      metadata.seed <= 0xffffffff,
    "无效种子",
  );
  check(
    metadata.online_threshold_seconds === 300,
    "心跳阈值与现有指标口径不一致",
  );
  assert.deepEqual(
    metadata.locations,
    locations.filter((site) => site.id !== "all"),
    "点位与现有 catalog 不一致；不得静默修改应用配置",
  );
  const locationIds = new Set(metadata.locations.map((site) => site.id));
  const snapshot = Date.parse(metadata.snapshot_at);
  check(Number.isFinite(snapshot), "无效快照时间");
  check(metadata.period.day_count === 30, "数据必须覆盖30个自然日");
  const start = Date.parse(`${metadata.period.start_date}T00:00:00+08:00`);
  const end =
    Date.parse(`${metadata.period.end_date}T00:00:00+08:00`) + 86_400_000;
  check(
    end - start === 30 * 86_400_000 && start <= snapshot && snapshot < end,
    "时间范围与快照不一致",
  );

  const allIds = new Set();
  function unique(value, label) {
    check(typeof value === "string" && value.length > 0, `${label} 缺少ID`);
    check(!allIds.has(value), `重复ID ${value}`);
    allIds.add(value);
  }
  function time(value, label) {
    check(
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value),
      `${label} 必须为UTC ISO时间`,
    );
    const number = Date.parse(value);
    check(
      Number.isFinite(number) && number <= snapshot,
      `${label} 超过快照时间或无效`,
    );
    return number;
  }
  const deviceMap = new Map();
  check(devices.length === 8, "应有8台设备");
  for (const device of devices) {
    unique(device.device_id, "device");
    check(locationIds.has(device.location_id), "设备点位不存在");
    if (device.last_heartbeat_at !== null)
      time(device.last_heartbeat_at, "设备心跳");
    deviceMap.set(device.device_id, device);
  }
  for (const locationId of locationIds)
    check(
      devices.filter((device) => device.location_id === locationId).length ===
        2,
      "每个点位应有2台设备",
    );

  const scenarioIds = new Set(
    scenarios.map((scenario) => scenario.scenario_id),
  );
  const sessionMap = new Map();
  for (const session of sessions) {
    unique(session.session_id, "session");
    check(/^visitor-\d+$/.test(session.visitor_id), "仅允许虚构匿名用户标识");
    check(locationIds.has(session.location_id), "体验点位不存在");
    check(
      deviceMap.get(session.device_id)?.location_id === session.location_id,
      "体验设备与点位不匹配",
    );
    const started = time(session.started_at, "体验开始时间");
    check(started >= start && started < end, "体验超出数据范围");
    check(
      Array.isArray(session.scenario_ids) &&
        session.scenario_ids.every((id) => scenarioIds.has(id)),
      "体验引用了未知案例",
    );
    check(Array.isArray(session.fixture_tags), "边界标签必须是数组");
    sessionMap.set(session.session_id, session);
  }

  const taskSessions = new Set();
  const failureCodes = new Set([
    "GENERATION_TIMEOUT",
    "SERVICE_UNAVAILABLE",
    "INVALID_OUTPUT",
  ]);
  const moderationReasons = new Set([
    "UNSAFE_CONTENT",
    "PERSONAL_INFORMATION_RISK",
    "BRAND_POLICY_REVIEW",
  ]);
  for (const job of generations) {
    unique(job.generation_id, "generation");
    const session = sessionMap.get(job.session_id);
    check(session, "任务引用的体验不存在");
    check(
      !taskSessions.has(job.session_id),
      "一个体验只能对应一个逻辑任务；重试必须保留在 attempts 内",
    );
    taskSessions.add(job.session_id);
    const submitted = time(job.submitted_at, "任务提交时间");
    check(submitted >= Date.parse(session.started_at), "任务先于体验开始");
    check(
      ["success", "failed", "queued", "processing"].includes(job.status),
      "未知任务状态",
    );
    check(
      Array.isArray(job.attempts) && Array.isArray(job.scan_events),
      "尝试和扫码事件必须为数组",
    );
    const terminal = ["success", "failed"].includes(job.status);
    if (terminal) {
      const completed = time(job.completed_at, "任务结束时间");
      check(completed > submitted, "任务结束必须晚于提交");
      check(
        job.duration_ms === completed - submitted,
        "任务耗时与时间戳不一致",
      );
      check(job.attempts.length > 0, "结束任务缺少尝试记录");
    } else {
      check(
        job.completed_at === null &&
          job.duration_ms === null &&
          job.failure_code === null,
        "未结束任务不得带最终结果",
      );
    }
    if (job.status === "queued")
      check(job.attempts.length === 0, "排队任务不能已经开始尝试");
    if (job.status === "processing")
      check(job.attempts.length > 0, "处理中任务必须有尝试");

    let previousEnd = submitted;
    for (const [index, attempt] of job.attempts.entries()) {
      unique(attempt.attempt_id, "attempt");
      const attemptStart = time(attempt.started_at, "尝试开始时间");
      check(attemptStart >= previousEnd, "重试时间重叠或早于提交");
      const last = index === job.attempts.length - 1;
      if (!last) check(attempt.status === "failed", "只有失败后才能内部重试");
      if (attempt.status === "processing") {
        check(
          last &&
            job.status === "processing" &&
            attempt.ended_at === null &&
            attempt.failure_code === null,
          "处理中尝试状态不一致",
        );
      } else {
        check(["success", "failed"].includes(attempt.status), "无效尝试状态");
        previousEnd = time(attempt.ended_at, "尝试结束时间");
        check(previousEnd > attemptStart, "尝试时间倒置");
        check(
          attempt.status === "failed"
            ? failureCodes.has(attempt.failure_code)
            : attempt.failure_code === null,
          "尝试失败原因不一致",
        );
      }
      if (last) {
        check(attempt.status === job.status, "最后一次尝试与任务状态不一致");
        if (terminal)
          check(
            attempt.ended_at === job.completed_at &&
              attempt.failure_code === job.failure_code,
            "最终结果与最后尝试不一致",
          );
      }
    }
    if (job.status === "success") {
      check(job.failure_code === null, "成功任务不能保留最终失败原因");
      check(
        ["passed", "blocked", "pending"].includes(job.moderation_status),
        "成功任务必须进入审核",
      );
      if (job.moderation_status === "pending") {
        check(
          job.reviewed_at === null && job.moderation_reason === null,
          "待审核不能有审核结论",
        );
      } else {
        check(
          time(job.reviewed_at, "审核时间") >= Date.parse(job.completed_at),
          "审核不能先于生成完成",
        );
        check(
          job.moderation_status === "blocked"
            ? moderationReasons.has(job.moderation_reason)
            : job.moderation_reason === null,
          "审核原因不一致",
        );
      }
    } else {
      check(
        job.moderation_status === "not_applicable" &&
          job.reviewed_at === null &&
          job.moderation_reason === null,
        "未成功任务不能进入结果审核",
      );
    }
    if (job.result_displayed_at !== null) {
      check(
        job.status === "success" && job.moderation_status === "passed",
        "只有审核通过的成功结果才可展示",
      );
      check(
        time(job.result_displayed_at, "结果展示时间") >=
          Date.parse(job.reviewed_at),
        "展示不能先于审核通过",
      );
    }
    for (const event of job.scan_events) {
      unique(event.scan_event_id, "scan");
      check(job.result_displayed_at !== null, "无可领取结果却发生扫码");
      check(
        time(event.scanned_at, "扫码时间") >=
          Date.parse(job.result_displayed_at),
        "扫码不能先于结果展示",
      );
    }
    if (session.device_id === "chengdu-02")
      check(
        Date.parse(job.completed_at ?? job.submitted_at) <=
          Date.parse(deviceMap.get("chengdu-02").last_heartbeat_at),
        "离线案例中的设备停止后仍有任务活动",
      );
  }

  const reports = scenarios.map((scenario) => {
    unique(scenario.scenario_id, "scenario");
    check(
      scenario.root_cause_confirmed === false &&
        scenario.data_origin === "synthetic",
      "异常案例不能声称确认真实根因",
    );
    check(["anomaly", "boundary"].includes(scenario.kind), "未知案例类型");
    check(locationIds.has(scenario.selection.location_id), "案例引用未知点位");
    const rule = scenario.rule;
    let value;
    let denominator = null;
    let sample;
    if (scenario.selection.scope === "snapshot") {
      const device = deviceMap.get(scenario.selection.device_id);
      check(
        device?.location_id === scenario.selection.location_id,
        "案例设备与点位不一致",
      );
      value = deviceStatus(device, metadata);
    } else {
      sample = sessions.filter(
        (session) =>
          session.location_id === scenario.selection.location_id &&
          dateInShanghai(session.started_at) >= scenario.selection.start_date &&
          dateInShanghai(session.started_at) <= scenario.selection.end_date,
      );
      const summary = summarizeRecords(sample, generations);
      value = summary[rule.metric];
      const denominators = {
        generation_failure_rate: "ended_task_count",
        average_success_duration_seconds: "success_count",
        scan_conversion_rate: "displayed_session_count",
        moderation_block_rate: "moderation_reviewed_count",
      };
      denominator = denominators[rule.metric]
        ? summary[denominators[rule.metric]]
        : 0;
      if (Object.hasOwn(rule, "minimum_denominator"))
        check(
          denominator >= rule.minimum_denominator,
          `${scenario.scenario_id} 未达到最小样本量`,
        );
      if (scenario.scenario_id === "generation-timeout") {
        const ids = new Set(sample.map((session) => session.session_id));
        check(
          generations.some(
            (job) =>
              ids.has(job.session_id) &&
              job.failure_code === "GENERATION_TIMEOUT",
          ),
          "超时案例缺少超时证据",
        );
      }
    }
    check(
      value !== null && value !== undefined,
      `${scenario.scenario_id} 没有可计算结果`,
    );
    if (Object.hasOwn(rule, "equals"))
      assert.equal(value, rule.equals, `${scenario.scenario_id} 案例不成立`);
    else if (rule.operator === ">=")
      check(value >= rule.threshold, `${scenario.scenario_id} 未达到设定阈值`);
    else if (rule.operator === "<")
      check(value < rule.threshold, `${scenario.scenario_id} 未低于设定阈值`);
    else throw new Error(`未知规则 ${scenario.scenario_id}`);
    return {
      scenario_id: scenario.scenario_id,
      title: scenario.title,
      observed: value,
      denominator,
      passed: true,
    };
  });

  check(
    sessions.some((session) => !taskSessions.has(session.session_id)),
    "缺少体验后未提交案例",
  );
  check(
    generations.some(
      (job) => job.attempts.length > 1 && job.status === "success",
    ),
    "缺少重试后成功案例",
  );
  check(
    generations.some((job) => job.scan_events.length > 1),
    "缺少重复扫码案例",
  );
  const summary = summarizeRecords(sessions, generations);
  check(
    summary.queued_count > 0 && summary.processing_count > 0,
    "缺少未结束任务案例",
  );
  check(summary.participant_count < summary.session_count, "缺少重复用户案例");
  const users = new Map();
  for (const session of sessions) {
    if (!users.has(session.visitor_id))
      users.set(session.visitor_id, new Set());
    users.get(session.visitor_id).add(session.location_id);
  }
  check(
    [...users.values()].some((set) => set.size > 1),
    "缺少跨点位用户案例",
  );
  const deviceCounts = { online: 0, offline: 0, unknown: 0 };
  for (const device of devices) deviceCounts[deviceStatus(device, metadata)]++;
  return {
    status: "PASS",
    seed: metadata.seed,
    snapshot_at: metadata.snapshot_at,
    summary,
    devices: deviceCounts,
    scenarios: reports,
  };
}

export function loadDataset(directory = DEFAULT_OUTPUT) {
  return Object.fromEntries(
    FILES.map((name) => [
      name,
      JSON.parse(readFileSync(resolve(directory, name), "utf8")),
    ]),
  );
}

export function verifyManifest(directory = DEFAULT_OUTPUT) {
  const manifest = JSON.parse(
    readFileSync(resolve(directory, "manifest.json"), "utf8"),
  );
  check(manifest.algorithm === "sha256", "未知校验算法");
  assert.deepEqual(
    manifest.files.map((file) => file.path).sort(),
    [...FILES].sort(),
    "校验清单文件不完整",
  );
  for (const file of manifest.files) {
    const bytes = readFileSync(resolve(directory, file.path));
    check(bytes.length === file.bytes, `${file.path} 文件大小校验失败`);
    check(
      createHash("sha256").update(bytes).digest("hex") === file.sha256,
      `${file.path} 文件哈希校验失败`,
    );
  }
  return true;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  check(
    args.length === 0 || (args.length === 2 && args[0] === "--dir"),
    "用法：node scripts/validate-mock-data.mjs [--dir 目录]",
  );
  const directory = args.length ? resolve(args[1]) : DEFAULT_OUTPUT;
  verifyManifest(directory);
  console.log(JSON.stringify(validateDataset(loadDataset(directory)), null, 2));
}
