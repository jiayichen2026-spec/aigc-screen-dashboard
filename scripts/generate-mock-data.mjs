import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locations } from "../src/data/catalog.ts";

export const DEFAULT_SEED = 20261004;
export const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../public/mock/", import.meta.url),
);
const DAY = 86_400_000;
const START = Date.parse("2026-09-05T00:00:00+08:00");
const SNAPSHOT = Date.parse("2026-10-04T18:00:00+08:00");
const OFFLINE_AT = Date.parse("2026-10-04T15:04:00+08:00");
const iso = (time) => new Date(time).toISOString();
const localDate = (time) =>
  new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);

// Mulberry32: no Math.random(), system time, timezone, network, or external package.
function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let output = Math.imul(value ^ (value >>> 15), 1 | value);
    output ^= output + Math.imul(output ^ (output >>> 7), 61 | output);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function makeScenarios() {
  const selection = (location_id, start_date, end_date) => ({
    location_id,
    start_date,
    end_date,
  });
  return [
    {
      scenario_id: "generation-timeout",
      kind: "anomaly",
      title: "上海生成超时增多",
      selection: selection("shanghai", "2026-10-02", "2026-10-03"),
      rule: {
        metric: "generation_failure_rate",
        operator: ">=",
        threshold: 0.25,
        minimum_denominator: 30,
      },
      suspected_cause: "排队拥堵或生成服务响应异常，尚未确认根因。",
      suggested_action: "查看超时任务与重试记录，对照服务耗时和排队情况。",
    },
    {
      scenario_id: "slow-generation",
      kind: "anomaly",
      title: "杭州成功任务耗时偏高",
      selection: selection("hangzhou", "2026-10-03", "2026-10-03"),
      rule: {
        metric: "average_success_duration_seconds",
        operator: ">=",
        threshold: 35,
        minimum_denominator: 10,
      },
      suspected_cause: "可能涉及排队、内部重试或生成链路变慢。",
      suggested_action: "分别检查排队与执行耗时，不直接将总耗时归因于模型。",
    },
    {
      scenario_id: "low-scan-conversion",
      kind: "anomaly",
      title: "北京结果领取转化偏低",
      selection: selection("beijing", "2026-10-01", "2026-10-03"),
      rule: {
        metric: "scan_conversion_rate",
        operator: "<",
        threshold: 0.15,
        minimum_denominator: 30,
      },
      suspected_cause: "可能与领取引导、二维码可见性或体验意愿有关。",
      suggested_action: "检查可领取结果展示与扫码引导，结合现场反馈判断原因。",
    },
    {
      scenario_id: "moderation-blocks",
      kind: "anomaly",
      title: "成都内容拦截比例升高",
      selection: selection("chengdu", "2026-10-02", "2026-10-03"),
      rule: {
        metric: "moderation_block_rate",
        operator: ">=",
        threshold: 0.2,
        minimum_denominator: 20,
      },
      suspected_cause: "审核分类集中出现风险提示，需进一步复核。",
      suggested_action:
        "查看风险分类与提示词规则；不能仅为提高通过率而放松审核。",
    },
    {
      scenario_id: "moderation-backlog",
      kind: "anomaly",
      title: "杭州存在待审核积压",
      selection: selection("hangzhou", "2026-10-04", "2026-10-04"),
      rule: {
        metric: "moderation_pending_count",
        operator: ">=",
        threshold: 3,
        minimum_denominator: 0,
      },
      suspected_cause: "可能存在审核处理延迟，生成成功不代表结果已经可领取。",
      suggested_action: "检查待审核队列及等待时间，安排复核或排查审核服务。",
    },
    {
      scenario_id: "device-offline",
      kind: "anomaly",
      title: "成都02号设备心跳超时",
      selection: {
        location_id: "chengdu",
        device_id: "chengdu-02",
        scope: "snapshot",
      },
      rule: { metric: "device_status", equals: "offline" },
      suspected_cause: "未收到近期心跳，无法直接确认是网络、供电还是程序问题。",
      suggested_action: "联系现场检查网络、供电及应用进程，记录恢复情况。",
    },
    {
      scenario_id: "device-unknown",
      kind: "boundary",
      title: "北京02号设备状态未知",
      selection: {
        location_id: "beijing",
        device_id: "beijing-02",
        scope: "snapshot",
      },
      rule: { metric: "device_status", equals: "unknown" },
      suspected_cause: "快照中缺少心跳记录，不能直接判为离线。",
      suggested_action:
        "检查设备登记与心跳采集；体验数据和心跳可能来自不同链路。",
    },
    {
      scenario_id: "empty-location-day",
      kind: "boundary",
      title: "成都9月5日无体验数据",
      selection: selection("chengdu", "2026-09-05", "2026-09-05"),
      rule: { metric: "session_count", equals: 0 },
      suspected_cause: "仅能确认没有体验记录，不能由此判定设备故障。",
      suggested_action: "展示空状态，比例和平均时长显示“—”；设备快照仍可查看。",
    },
    {
      scenario_id: "small-sample",
      kind: "boundary",
      title: "北京9月5日样本不足",
      selection: selection("beijing", "2026-09-05", "2026-09-05"),
      rule: { metric: "session_count", equals: 3 },
      suspected_cause: "样本数量不足以支持稳定的比例比较。",
      suggested_action:
        "展示样本量并提示谨慎解读，不触发基于30个样本的比例告警。",
    },
  ].map((item) => ({
    ...item,
    root_cause_confirmed: false,
    data_origin: "synthetic",
  }));
}

export function generateDataset(seed = DEFAULT_SEED) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("seed 必须是 0 至 4294967295 的整数");
  const random = randomSource(seed);
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const choose = (values) => values[integer(0, values.length - 1)];
  const sites = locations
    .filter((site) => site.id !== "all")
    .map((site) => ({ ...site }));
  const sessions = [];
  const generations = [];
  const visitors = [];
  let sessionIndex = 0;
  let jobIndex = 0;
  const devices = sites.flatMap((site) =>
    [1, 2].map((number) => {
      const device_id = `${site.id}-${String(number).padStart(2, "0")}`;
      return {
        device_id,
        location_id: site.id,
        name: `${site.name} ${number}号屏`,
        last_heartbeat_at:
          device_id === "beijing-02"
            ? null
            : iso(
                device_id === "chengdu-02"
                  ? OFFLINE_AT
                  : SNAPSHOT - integer(15, 180) * 1000,
              ),
      };
    }),
  );

  function addSession(locationId, time, options = {}) {
    let visitorId = options.visitorId;
    if (!visitorId) {
      if (visitors.length && random() < 0.18) visitorId = choose(visitors);
      else {
        visitorId = `visitor-${String(visitors.length + 1).padStart(5, "0")}`;
        visitors.push(visitorId);
      }
    }
    let deviceId = options.deviceId ?? `${locationId}-${choose(["01", "02"])}`;
    // Offline fixture: no new sessions or tasks after this device stops reporting.
    if (deviceId === "chengdu-02" && time >= OFFLINE_AT - 20 * 60_000)
      deviceId = "chengdu-01";
    const session = {
      session_id: `session-${String(++sessionIndex).padStart(5, "0")}`,
      visitor_id: visitorId,
      location_id: locationId,
      device_id: deviceId,
      started_at: iso(time),
      scenario_ids: options.scenarioIds ?? [],
      fixture_tags: options.fixtureTags ?? [],
    };
    sessions.push(session);
    return session;
  }

  function addGeneration(session, options = {}) {
    const id = `generation-${String(++jobIndex).padStart(5, "0")}`;
    const submitted =
      Date.parse(session.started_at) +
      (options.submissionDelayMs ?? integer(2, 12) * 1000);
    const status =
      options.status ??
      (random() < (options.failureProbability ?? 0.045) ? "failed" : "success");
    const job = {
      generation_id: id,
      session_id: session.session_id,
      submitted_at: iso(submitted),
      completed_at: null,
      status,
      duration_ms: null,
      failure_code: null,
      attempts: [],
      moderation_status: "not_applicable",
      reviewed_at: null,
      moderation_reason: null,
      result_displayed_at: null,
      scan_events: [],
    };
    if (status === "queued") {
      generations.push(job);
      return job;
    }
    if (status === "processing") {
      job.attempts.push({
        attempt_id: `${id}-a1`,
        started_at: iso(submitted + 1000),
        ended_at: null,
        status: "processing",
        failure_code: null,
      });
      generations.push(job);
      return job;
    }
    const attemptCount = options.forceRetry ? 2 : random() < 0.08 ? 2 : 1;
    let clock = submitted;
    for (let attempt = 1; attempt <= attemptCount; attempt++) {
      clock += integer(1, 5) * 1000;
      const started = clock;
      const last = attempt === attemptCount;
      const attemptStatus = last ? status : "failed";
      const failureCode =
        attemptStatus === "failed"
          ? (options.failureCode ??
            choose([
              "GENERATION_TIMEOUT",
              "SERVICE_UNAVAILABLE",
              "INVALID_OUTPUT",
            ]))
          : null;
      clock +=
        (options.slow
          ? integer(42, 65)
          : failureCode === "GENERATION_TIMEOUT"
            ? 60
            : integer(8, 24)) * 1000;
      job.attempts.push({
        attempt_id: `${id}-a${attempt}`,
        started_at: iso(started),
        ended_at: iso(clock),
        status: attemptStatus,
        failure_code: failureCode,
      });
    }
    job.completed_at = iso(clock);
    job.duration_ms = clock - submitted;
    job.failure_code = job.attempts.at(-1).failure_code;
    if (status === "success") {
      job.moderation_status =
        options.moderation ??
        (random() < (options.blockProbability ?? 0.035) ? "blocked" : "passed");
      if (job.moderation_status !== "pending") {
        clock += integer(1, 4) * 1000;
        job.reviewed_at = iso(clock);
        if (job.moderation_status === "blocked")
          job.moderation_reason = choose([
            "UNSAFE_CONTENT",
            "PERSONAL_INFORMATION_RISK",
            "BRAND_POLICY_REVIEW",
          ]);
        if (
          job.moderation_status === "passed" &&
          (options.forceDisplay || random() < 0.97)
        ) {
          clock += 1000;
          job.result_displayed_at = iso(clock);
          if (
            options.forceScan ||
            random() < (options.scanProbability ?? 0.43)
          ) {
            const scans = options.duplicateScan ? 3 : random() < 0.09 ? 2 : 1;
            for (let index = 0; index < scans; index++) {
              clock += integer(3, 22) * 1000;
              job.scan_events.push({
                scan_event_id: `${id}-scan${index + 1}`,
                scanned_at: iso(clock),
              });
            }
          }
        }
      }
    }
    generations.push(job);
    return job;
  }

  for (let day = 0; day < 30; day++) {
    const date = localDate(START + day * DAY);
    const weekend = [0, 6].includes(
      new Date(START + day * DAY + 8 * 3_600_000).getUTCDay(),
    );
    for (const site of sites) {
      if (day === 0 && site.id === "chengdu") continue;
      const smallSample = day === 0 && site.id === "beijing";
      const count = smallSample ? 3 : integer(23, 35) + (weekend ? 7 : 0);
      for (let index = 0; index < count; index++) {
        const time =
          START +
          day * DAY +
          integer(
            9 * 3600,
            day === 29 ? 17 * 3600 + 25 * 60 : 20 * 3600 + 30 * 60,
          ) *
            1000;
        const timeout =
          site.id === "shanghai" &&
          date >= "2026-10-02" &&
          date <= "2026-10-03";
        const slow = site.id === "hangzhou" && date === "2026-10-03";
        const lowScan =
          site.id === "beijing" && date >= "2026-10-01" && date <= "2026-10-03";
        const blocks =
          site.id === "chengdu" && date >= "2026-10-02" && date <= "2026-10-03";
        const backlog = site.id === "hangzhou" && date === "2026-10-04";
        const scenarioIds = [
          timeout && "generation-timeout",
          slow && "slow-generation",
          lowScan && "low-scan-conversion",
          blocks && "moderation-blocks",
          backlog && "moderation-backlog",
          smallSample && "small-sample",
        ].filter(Boolean);
        const session = addSession(site.id, time, { scenarioIds });
        // Deliberately include abandonment before submission in the normal traffic.
        if (!scenarioIds.length && random() < 0.08) continue;
        addGeneration(session, {
          // Deterministic injection guarantees observable cases for every seed.
          status: timeout
            ? index % 3 === 0
              ? "failed"
              : "success"
            : blocks || backlog || slow || lowScan
              ? "success"
              : undefined,
          failureCode: timeout ? "GENERATION_TIMEOUT" : undefined,
          slow,
          moderation: blocks
            ? index % 3 === 0
              ? "blocked"
              : "passed"
            : backlog
              ? index % 2 === 0
                ? "pending"
                : "passed"
              : lowScan
                ? "passed"
                : undefined,
          forceDisplay: lowScan,
          scanProbability: lowScan ? 0 : undefined,
          forceScan: lowScan && index === 0,
        });
      }
    }
  }

  // Isolated boundary records live within the regular dataset, with explicit tags.
  const repeat = addSession(
    "shanghai",
    Date.parse("2026-10-04T12:00:00+08:00"),
    { fixtureTags: ["repeat-user", "duplicate-scan", "internal-retry"] },
  );
  addGeneration(repeat, {
    status: "success",
    moderation: "passed",
    forceRetry: true,
    forceDisplay: true,
    forceScan: true,
    duplicateScan: true,
  });
  const repeatSameSite = addSession(
    "shanghai",
    Date.parse("2026-10-04T13:00:00+08:00"),
    { visitorId: repeat.visitor_id, fixtureTags: ["repeat-user"] },
  );
  addGeneration(repeatSameSite, {
    status: "failed",
    failureCode: "INVALID_OUTPUT",
  });
  const repeatOtherSite = addSession(
    "beijing",
    Date.parse("2026-10-04T14:00:00+08:00"),
    { visitorId: repeat.visitor_id, fixtureTags: ["cross-location-user"] },
  );
  addGeneration(repeatOtherSite, {
    status: "success",
    moderation: "passed",
    forceDisplay: true,
  });
  addSession("chengdu", Date.parse("2026-10-04T16:00:00+08:00"), {
    fixtureTags: ["no-submission"],
  });
  const queued = addSession(
    "shanghai",
    Date.parse("2026-10-04T17:59:40+08:00"),
    { fixtureTags: ["queued-at-snapshot"] },
  );
  addGeneration(queued, { status: "queued", submissionDelayMs: 1000 });
  const processing = addSession(
    "beijing",
    Date.parse("2026-10-04T17:59:35+08:00"),
    { fixtureTags: ["processing-at-snapshot"] },
  );
  addGeneration(processing, { status: "processing", submissionDelayMs: 1000 });

  sessions.sort(
    (a, b) =>
      a.started_at.localeCompare(b.started_at) ||
      a.session_id.localeCompare(b.session_id),
  );
  generations.sort(
    (a, b) =>
      a.submitted_at.localeCompare(b.submitted_at) ||
      a.generation_id.localeCompare(b.generation_id),
  );
  return {
    "metadata.json": {
      schema_version: "1.0.0",
      generator_version: "1.0.0",
      seed,
      data_origin: "synthetic",
      timezone: "Asia/Shanghai",
      utc_offset: "+08:00",
      period: {
        start_date: "2026-09-05",
        end_date: "2026-10-04",
        day_count: 30,
      },
      snapshot_at: iso(SNAPSHOT),
      online_threshold_seconds: 300,
      default_range_days: 7,
      locations: sites,
      date_attribution: "session_started_at",
      status_as_of: "snapshot_at",
      device_filter_scope: "location_only",
      visitor_identity_scope: "synthetic_cross_location",
      generation_granularity:
        "one_logical_task_per_session_with_internal_attempts",
    },
    "sessions.json": sessions,
    "generations.json": generations,
    "devices.json": devices,
    "scenarios.json": makeScenarios(),
  };
}

export function serializeDataset(dataset) {
  const files = Object.fromEntries(
    Object.entries(dataset).map(([name, value]) => [
      name,
      JSON.stringify(value, null, 2) + "\n",
    ]),
  );
  const manifest = {
    algorithm: "sha256",
    files: Object.entries(files).map(([path, content]) => ({
      path,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
  };
  return {
    ...files,
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
  };
}

export function writeDataset(
  outputDirectory = DEFAULT_OUTPUT,
  seed = DEFAULT_SEED,
) {
  const dataset = generateDataset(seed);
  const files = serializeDataset(dataset);
  mkdirSync(outputDirectory, { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(resolve(outputDirectory, name), content);
  return dataset;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  let seed = DEFAULT_SEED;
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--seed" && args[index + 1])
      seed = Number(args[++index]);
    else if (args[index] === "--out" && args[index + 1])
      output = resolve(args[++index]);
    else throw new Error(`未知或不完整参数：${args[index]}`);
  }
  const data = writeDataset(output, seed);
  console.log(
    JSON.stringify(
      {
        seed,
        output,
        sessions: data["sessions.json"].length,
        generations: data["generations.json"].length,
        devices: data["devices.json"].length,
        scenarios: data["scenarios.json"].length,
      },
      null,
      2,
    ),
  );
}
