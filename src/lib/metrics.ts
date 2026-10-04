import type {
  Device,
  Generation,
  Metadata,
  MetricDataset,
  Session,
} from "../types/mock-data.ts";

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 3_600_000;
const MAX_RANGE_DAYS = 366;

export class MetricInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricInputError";
  }
}

function requireCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new MetricInputError(message);
}

/** UTC timestamp parser; rejects silently normalized calendar dates. */
function timestamp(value: string): number {
  requireCondition(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value),
    `无效UTC时间戳：${value}`,
  );
  const time = Date.parse(value);
  requireCondition(
    Number.isFinite(time) &&
      new Date(time).toISOString() ===
        (value.includes(".") ? value : value.replace("Z", ".000Z")),
    `无效UTC日期：${value}`,
  );
  return time;
}

/** Inclusive calendar dates are normalized to Shanghai midnight, never local time. */
export function shanghaiDayStart(date: string): number {
  requireCondition(
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    `日期须为YYYY-MM-DD：${date}`,
  );
  return timestamp(`${date}T00:00:00.000Z`) - SHANGHAI_OFFSET_MS;
}

export function toShanghaiDate(value: string): string {
  return new Date(timestamp(value) + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export interface MetricFilter {
  startDate: string;
  endDate: string;
  locationId: string; // "all" is the existing UI option, not a stored location.
}

export interface Metrics {
  participants: number;
  sessions: number;
  generation: {
    submitted: number;
    succeeded: number;
    failed: number;
    queued: number;
    processing: number;
    ended: number;
    successRate: number | null;
    successfulDurationMs: number;
    averageSeconds: number | null;
  };
  conversion: {
    eligibleSessions: number;
    scannedSessions: number;
    scanEvents: number;
    rate: number | null;
  };
  moderation: {
    passed: number;
    blocked: number;
    pending: number;
    notApplicable: number;
    reviewed: number;
    passRate: number | null;
  };
}

export type DeviceStatus = "online" | "offline" | "unknown";
export interface DeviceSnapshot {
  asOf: string;
  total: number;
  online: number;
  offline: number;
  unknown: number;
  items: (Device & {
    status: DeviceStatus;
    heartbeatAgeSeconds: number | null;
  })[];
}

export interface DashboardCalculation {
  filter: MetricFilter;
  coverage: {
    dateRange: "within" | "partial" | "outside";
    availableStartDate: string;
    availableEndDate: string;
    observedThrough: string;
    incompleteDates: string[];
  };
  metrics: Metrics | null;
  daily: {
    date: string;
    coverage: "complete" | "partial" | "unavailable";
    metrics: Metrics | null;
  }[];
  locations: { id: string; name: string; metrics: Metrics | null }[];
  devices: DeviceSnapshot;
  recordIds: { sessions: string[]; generations: string[] };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function validateMetadata(metadata: Metadata) {
  requireCondition(metadata.schema_version === "1.0.0", "不支持的数据版本");
  requireCondition(
    metadata.timezone === "Asia/Shanghai" && metadata.utc_offset === "+08:00",
    "当前契约仅支持北京时间",
  );
  requireCondition(
    metadata.date_attribution === "session_started_at" &&
      metadata.status_as_of === "snapshot_at",
    "业务日期或快照口径不一致",
  );
  requireCondition(
    metadata.device_filter_scope === "location_only" &&
      metadata.online_threshold_seconds === 300,
    "设备指标口径不一致",
  );
  requireCondition(
    metadata.generation_granularity ===
      "one_logical_task_per_session_with_internal_attempts",
    "逻辑任务粒度不一致",
  );
  const start = shanghaiDayStart(metadata.period.start_date);
  const end = shanghaiDayStart(metadata.period.end_date) + DAY_MS;
  const snapshot = timestamp(metadata.snapshot_at);
  requireCondition(
    end > start &&
      (end - start) / DAY_MS === metadata.period.day_count &&
      start <= snapshot &&
      snapshot < end,
    "数据范围与快照不一致",
  );
  const ids = metadata.locations.map((site) => site.id);
  requireCondition(
    ids.length > 0 &&
      new Set(ids).size === ids.length &&
      ids.every(
        (id) => typeof id === "string" && id.length > 0 && id !== "all",
      ),
    "点位配置存在重复或保留ID",
  );
}

/** These runtime checks defend metric denominators; full fixture QA remains in scripts/. */
function validateInput(data: MetricDataset) {
  validateMetadata(data.metadata);
  const snapshot = timestamp(data.metadata.snapshot_at);
  const locationIds = new Set(data.metadata.locations.map((site) => site.id));
  const sessionMap = new Map<string, Session>();
  const deviceMap = new Map<string, Device>();
  const allIds = new Set<string>();
  function unique(id: string) {
    requireCondition(
      typeof id === "string" && id.length > 0 && !allIds.has(id),
      `记录ID缺失或重复：${id}`,
    );
    allIds.add(id);
  }
  function observedTime(value: string) {
    const time = timestamp(value);
    requireCondition(
      time <= snapshot,
      "记录时间超过快照；请先修正数据，不能直接读取未来结果",
    );
    return time;
  }
  for (const device of data.devices) {
    unique(device.device_id);
    requireCondition(locationIds.has(device.location_id), "设备引用未知点位");
    if (device.last_heartbeat_at !== null)
      observedTime(device.last_heartbeat_at);
    deviceMap.set(device.device_id, device);
  }
  for (const session of data.sessions) {
    unique(session.session_id);
    requireCondition(
      typeof session.visitor_id === "string" && session.visitor_id.length > 0,
      "体验缺少匿名用户ID",
    );
    requireCondition(
      locationIds.has(session.location_id) &&
        deviceMap.get(session.device_id)?.location_id === session.location_id,
      "体验点位与设备不匹配",
    );
    observedTime(session.started_at);
    const date = toShanghaiDate(session.started_at);
    requireCondition(
      date >= data.metadata.period.start_date &&
        date <= data.metadata.period.end_date,
      "体验超出数据覆盖范围",
    );
    sessionMap.set(session.session_id, session);
  }
  const taskSessions = new Set<string>();
  for (const job of data.generations) {
    unique(job.generation_id);
    const session = sessionMap.get(job.session_id);
    requireCondition(
      session && !taskSessions.has(job.session_id),
      "任务关联不存在或一个体验对应多个逻辑任务",
    );
    taskSessions.add(job.session_id);
    const submitted = observedTime(job.submitted_at);
    requireCondition(
      submitted >= timestamp(session.started_at),
      "任务提交早于体验开始",
    );
    requireCondition(
      ["success", "failed", "queued", "processing"].includes(job.status),
      "未知任务状态",
    );
    const ended = job.status === "success" || job.status === "failed";
    if (ended) {
      requireCondition(job.completed_at !== null, "已结束任务缺少完成时间");
      const completed = observedTime(job.completed_at);
      requireCondition(
        completed > submitted && job.duration_ms === completed - submitted,
        "任务耗时与提交/结束时间不一致",
      );
    } else
      requireCondition(
        job.completed_at === null && job.duration_ms === null,
        "未结束任务不能携带最终耗时",
      );
    if (job.status === "success") {
      requireCondition(
        ["passed", "blocked", "pending"].includes(job.moderation_status),
        "成功任务审核状态错误",
      );
      if (job.moderation_status === "pending")
        requireCondition(
          job.reviewed_at === null,
          "待审核任务不能有审核结束时间",
        );
      else {
        requireCondition(job.reviewed_at !== null, "已审核任务缺少审核时间");
        requireCondition(
          observedTime(job.reviewed_at) >= timestamp(job.completed_at!),
          "审核时间早于生成完成",
        );
      }
    } else
      requireCondition(
        job.moderation_status === "not_applicable" && job.reviewed_at === null,
        "未成功任务不能有审核结果",
      );
    if (job.result_displayed_at !== null) {
      requireCondition(
        job.status === "success" &&
          job.moderation_status === "passed" &&
          job.reviewed_at !== null,
        "不可领取的结果存在展示事件",
      );
      requireCondition(
        observedTime(job.result_displayed_at) >= timestamp(job.reviewed_at),
        "结果展示早于审核",
      );
    }
    for (const scan of job.scan_events) {
      unique(scan.scan_event_id);
      requireCondition(
        job.result_displayed_at !== null,
        "扫码事件缺少可领取结果",
      );
      requireCondition(
        observedTime(scan.scanned_at) >= timestamp(job.result_displayed_at),
        "扫码早于结果展示",
      );
    }
  }
}

function aggregate(
  sessions: Session[],
  jobBySession: Map<string, Generation>,
): Metrics {
  const metrics: Metrics = {
    participants: 0,
    sessions: sessions.length,
    generation: {
      submitted: 0,
      succeeded: 0,
      failed: 0,
      queued: 0,
      processing: 0,
      ended: 0,
      successRate: null,
      successfulDurationMs: 0,
      averageSeconds: null,
    },
    conversion: {
      eligibleSessions: 0,
      scannedSessions: 0,
      scanEvents: 0,
      rate: null,
    },
    moderation: {
      passed: 0,
      blocked: 0,
      pending: 0,
      notApplicable: 0,
      reviewed: 0,
      passRate: null,
    },
  };
  const visitors = new Set<string>();
  for (const session of sessions) {
    visitors.add(session.visitor_id);
    const job = jobBySession.get(session.session_id);
    if (!job) continue;
    const generation = metrics.generation;
    generation.submitted++;
    if (job.status === "success") {
      generation.succeeded++;
      generation.successfulDurationMs +=
        timestamp(job.completed_at!) - timestamp(job.submitted_at);
    } else generation[job.status]++;
    if (job.moderation_status === "not_applicable")
      metrics.moderation.notApplicable++;
    else metrics.moderation[job.moderation_status]++;
    if (job.result_displayed_at !== null) metrics.conversion.eligibleSessions++;
    if (job.scan_events.length) metrics.conversion.scannedSessions++;
    metrics.conversion.scanEvents += job.scan_events.length;
  }
  metrics.participants = visitors.size;
  const generation = metrics.generation;
  generation.ended = generation.succeeded + generation.failed;
  generation.successRate = ratio(generation.succeeded, generation.ended);
  generation.averageSeconds = ratio(
    generation.successfulDurationMs / 1000,
    generation.succeeded,
  );
  metrics.conversion.rate = ratio(
    metrics.conversion.scannedSessions,
    metrics.conversion.eligibleSessions,
  );
  metrics.moderation.reviewed =
    metrics.moderation.passed + metrics.moderation.blocked;
  metrics.moderation.passRate = ratio(
    metrics.moderation.passed,
    metrics.moderation.reviewed,
  );
  return metrics;
}

function snapshotDevices(
  devices: Device[],
  metadata: Metadata,
): DeviceSnapshot {
  const items = devices.map((device) => {
    const age =
      device.last_heartbeat_at === null
        ? null
        : (timestamp(metadata.snapshot_at) -
            timestamp(device.last_heartbeat_at)) /
          1000;
    const status: DeviceStatus =
      age === null
        ? "unknown"
        : age <= metadata.online_threshold_seconds
          ? "online"
          : "offline";
    return { ...device, heartbeatAgeSeconds: age, status };
  });
  return {
    asOf: metadata.snapshot_at,
    total: items.length,
    online: items.filter((item) => item.status === "online").length,
    offline: items.filter((item) => item.status === "offline").length,
    unknown: items.filter((item) => item.status === "unknown").length,
    items,
  };
}

/** Anchored to the dataset snapshot, never Date.now(). */
export function defaultMetricFilter(
  metadata: Metadata,
  days = metadata.default_range_days,
): MetricFilter {
  validateMetadata(metadata);
  requireCondition(
    Number.isInteger(days) && days >= 1 && days <= MAX_RANGE_DAYS,
    "周期须为1至366天的整数",
  );
  const endDate = toShanghaiDate(metadata.snapshot_at);
  const startTime = Math.max(
    shanghaiDayStart(endDate) - (days - 1) * DAY_MS,
    shanghaiDayStart(metadata.period.start_date),
  );
  return {
    startDate: new Date(startTime + SHANGHAI_OFFSET_MS)
      .toISOString()
      .slice(0, 10),
    endDate,
    locationId: "all",
  };
}

/** Build once after loading JSON; calculate repeatedly as the UI filters change. */
export function createMetricEngine(input: MetricDataset) {
  // Own a snapshot so later caller mutations cannot silently invalidate the index.
  const data = structuredClone(input);
  validateInput(data);
  const { metadata } = data;
  const jobBySession = new Map(
    data.generations.map((job) => [job.session_id, job]),
  );
  const datedSessions = data.sessions.map((session) => ({
    session,
    date: toShanghaiDate(session.started_at),
  }));
  const snapshotDate = toShanghaiDate(metadata.snapshot_at);
  const snapshotTime = timestamp(metadata.snapshot_at);

  function calculate(filter: MetricFilter): DashboardCalculation {
    const start = shanghaiDayStart(filter.startDate);
    const end = shanghaiDayStart(filter.endDate);
    requireCondition(start <= end, "开始日期不能晚于结束日期");
    requireCondition(
      (end - start) / DAY_MS + 1 <= MAX_RANGE_DAYS,
      "单次日期范围不能超过366天",
    );
    requireCondition(
      filter.locationId === "all" ||
        metadata.locations.some((site) => site.id === filter.locationId),
      "未知点位，不能默认为全部点位",
    );
    const outside =
      filter.endDate < metadata.period.start_date ||
      filter.startDate > snapshotDate;
    const dateRange = outside
      ? "outside"
      : filter.startDate < metadata.period.start_date ||
          filter.endDate > snapshotDate
        ? "partial"
        : "within";
    const selected = datedSessions.filter(
      ({ session, date }) =>
        date >= filter.startDate &&
        date <= filter.endDate &&
        (filter.locationId === "all" ||
          session.location_id === filter.locationId),
    );
    const selectedSessions = selected.map(({ session }) => session);
    const dayGroups = new Map<string, Session[]>();
    const siteGroups = new Map<string, Session[]>();
    for (const { session, date } of selected) {
      if (!dayGroups.has(date)) dayGroups.set(date, []);
      if (!siteGroups.has(session.location_id))
        siteGroups.set(session.location_id, []);
      dayGroups.get(date)!.push(session);
      siteGroups.get(session.location_id)!.push(session);
    }
    const daily: DashboardCalculation["daily"] = [];
    for (let day = start; day <= end; day += DAY_MS) {
      const date = new Date(day + SHANGHAI_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
      const available =
        date >= metadata.period.start_date && date <= snapshotDate;
      const coverage = !available
        ? "unavailable"
        : snapshotTime < day + DAY_MS - 1
          ? "partial"
          : "complete";
      daily.push({
        date,
        coverage,
        metrics: available
          ? aggregate(dayGroups.get(date) ?? [], jobBySession)
          : null,
      });
    }
    const sites = metadata.locations.filter(
      (site) => filter.locationId === "all" || site.id === filter.locationId,
    );
    return {
      filter: { ...filter },
      coverage: {
        dateRange,
        availableStartDate: metadata.period.start_date,
        availableEndDate: snapshotDate,
        observedThrough: metadata.snapshot_at,
        incompleteDates: daily
          .filter((day) => day.coverage === "partial")
          .map((day) => day.date),
      },
      metrics: outside ? null : aggregate(selectedSessions, jobBySession),
      daily,
      locations: sites.map((site) => ({
        ...site,
        metrics: outside
          ? null
          : aggregate(siteGroups.get(site.id) ?? [], jobBySession),
      })),
      devices: snapshotDevices(
        data.devices.filter(
          (device) =>
            filter.locationId === "all" ||
            device.location_id === filter.locationId,
        ),
        metadata,
      ),
      recordIds: {
        sessions: selectedSessions.map((session) => session.session_id),
        generations: selectedSessions.flatMap((session) => {
          const job = jobBySession.get(session.session_id);
          return job ? [job.generation_id] : [];
        }),
      },
    };
  }

  return {
    calculate,
    defaultFilter: (days?: number) => defaultMetricFilter(metadata, days),
  };
}
