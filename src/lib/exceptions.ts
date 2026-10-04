import { createMetricEngine, shanghaiDayStart } from "./metrics.ts";
import type { MetricFilter, Metrics, DeviceSnapshot } from "./metrics.ts";
import type { MetricDataset, Session, Generation } from "../types/mock-data.ts";

export type BusinessMetric =
  | "generation_failure_rate"
  | "average_success_duration_seconds"
  | "scan_conversion_rate"
  | "moderation_block_rate"
  | "moderation_pending_count"
  | "session_count";
export type Scenario = {
  scenario_id: string;
  kind: "anomaly" | "boundary";
  title: string;
  selection:
    | { location_id: string; start_date: string; end_date: string }
    | { location_id: string; device_id: string; scope: "snapshot" };
  rule:
    | {
        metric: Exclude<BusinessMetric, "session_count">;
        operator: ">=" | "<";
        threshold: number;
        minimum_denominator: number;
      }
    | { metric: "session_count"; equals: number }
    | { metric: "device_status"; equals: "offline" | "unknown" };
  suspected_cause: string;
  suggested_action: string;
  root_cause_confirmed: false;
  data_origin: "synthetic";
};
export interface ExceptionItem {
  scenario: Scenario;
  locationName: string;
  filter: MetricFilter;
  scope: "business" | "snapshot";
  observed: number | string;
  numerator: number | null;
  denominator: number | null;
  metrics: Metrics | null;
  device: DeviceSnapshot["items"][number] | null;
  records: { session: Session; job: Generation | null }[];
  relatedVisitors: number | null;
  relatedDevices: number;
  snapshotAt: string;
  incomplete: boolean;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`异常规则错误：${message}`);
}

export function parseScenarios(
  input: unknown,
  data: MetricDataset,
): Scenario[] {
  check(Array.isArray(input), "案例必须是数组");
  const ids = new Set<string>();
  const metrics = [
    "generation_failure_rate",
    "average_success_duration_seconds",
    "scan_conversion_rate",
    "moderation_block_rate",
    "moderation_pending_count",
  ];
  for (const candidate of input) {
    check(candidate && typeof candidate === "object", "案例格式无效");
    const c = candidate as Scenario;
    for (const key of [
      "scenario_id",
      "title",
      "suspected_cause",
      "suggested_action",
    ] as const)
      check(typeof c[key] === "string" && c[key].length > 0, `缺少${key}`);
    check(!ids.has(c.scenario_id), "案例ID重复");
    ids.add(c.scenario_id);
    check(
      ["anomaly", "boundary"].includes(c.kind) &&
        c.root_cause_confirmed === false &&
        c.data_origin === "synthetic",
      "案例来源或根因状态无效",
    );
    check(
      c.selection &&
        typeof c.selection === "object" &&
        data.metadata.locations.some(
          (site) => site.id === c.selection.location_id,
        ),
      "点位不存在",
    );
    check(c.rule && typeof c.rule === "object", "缺少规则");
    if ("scope" in c.selection) {
      check(
        c.selection.scope === "snapshot" &&
          c.rule.metric === "device_status" &&
          ["offline", "unknown"].includes(c.rule.equals),
        "设备规则不匹配",
      );
      const deviceId = c.selection.device_id;
      check(
        data.devices.some(
          (d) =>
            d.device_id === deviceId &&
            d.location_id === c.selection.location_id,
        ),
        "设备与点位不匹配",
      );
    } else {
      check(
        shanghaiDayStart(c.selection.start_date) <=
          shanghaiDayStart(c.selection.end_date),
        "日期反向",
      );
      check(
        c.selection.start_date >= data.metadata.period.start_date &&
          c.selection.end_date <= data.metadata.period.end_date,
        "案例日期超出数据覆盖",
      );
      if (c.rule.metric === "session_count")
        check(
          Number.isInteger(c.rule.equals) && c.rule.equals >= 0,
          "体验数条件无效",
        );
      else {
        check(
          c.rule.metric !== "device_status" && metrics.includes(c.rule.metric),
          "未知业务规则",
        );
        check(
          [">=", "<"].includes(c.rule.operator) &&
            Number.isFinite(c.rule.threshold) &&
            c.rule.threshold >= 0 &&
            Number.isInteger(c.rule.minimum_denominator) &&
            c.rule.minimum_denominator >= 0,
          "阈值或最小样本无效",
        );
        if (c.rule.metric.endsWith("_rate"))
          check(c.rule.threshold <= 1, "比例阈值应在0至1之间");
      }
    }
  }
  return structuredClone(input) as Scenario[];
}

function measurement(metric: BusinessMetric, m: Metrics) {
  switch (metric) {
    case "generation_failure_rate":
      return {
        value: m.generation.ended
          ? m.generation.failed / m.generation.ended
          : null,
        numerator: m.generation.failed,
        denominator: m.generation.ended,
      };
    case "average_success_duration_seconds":
      return {
        value: m.generation.averageSeconds,
        numerator: m.generation.successfulDurationMs / 1000,
        denominator: m.generation.succeeded,
      };
    case "scan_conversion_rate":
      return {
        value: m.conversion.rate,
        numerator: m.conversion.scannedSessions,
        denominator: m.conversion.eligibleSessions,
      };
    case "moderation_block_rate":
      return {
        value: m.moderation.reviewed
          ? m.moderation.blocked / m.moderation.reviewed
          : null,
        numerator: m.moderation.blocked,
        denominator: m.moderation.reviewed,
      };
    case "moderation_pending_count":
      return {
        value: m.moderation.pending,
        numerator: m.moderation.pending,
        denominator: 0,
      };
    case "session_count":
      return { value: m.sessions, numerator: m.sessions, denominator: 0 };
  }
}
function related(metric: BusinessMetric, job: Generation | null) {
  switch (metric) {
    case "generation_failure_rate":
      return job?.status === "failed";
    case "average_success_duration_seconds":
      return job?.status === "success";
    case "scan_conversion_rate":
      return job?.result_displayed_at != null && job.scan_events.length === 0;
    case "moderation_block_rate":
      return job?.moderation_status === "blocked";
    case "moderation_pending_count":
      return job?.moderation_status === "pending";
    case "session_count":
      return true;
  }
}

/** Rules select windows, never scenario_ids tags. All observed values come from the existing metric engine. */
export function createExceptionEngine(
  input: MetricDataset,
  rawScenarios: unknown,
) {
  const data = structuredClone(input);
  const scenarios = parseScenarios(rawScenarios, data);
  const engine = createMetricEngine(data);
  const sessions = new Map(data.sessions.map((s) => [s.session_id, s]));
  const jobs = new Map(data.generations.map((j) => [j.session_id, j]));
  function evaluate(filter: MetricFilter) {
    const selected = engine.calculate(filter);
    const items: ExceptionItem[] = [];
    let checked = 0,
      insufficient = 0;
    for (const scenario of scenarios) {
      const selection = scenario.selection;
      if (
        filter.locationId !== "all" &&
        filter.locationId !== selection.location_id
      )
        continue;
      const locationName = data.metadata.locations.find(
        (s) => s.id === selection.location_id,
      )!.name;
      if ("scope" in selection) {
        checked++;
        const device = selected.devices.items.find(
          (d) => d.device_id === selection.device_id,
        )!;
        if (
          scenario.rule.metric !== "device_status" ||
          device.status !== scenario.rule.equals
        )
          continue;
        items.push({
          scenario,
          locationName,
          filter: { ...filter, locationId: selection.location_id },
          scope: "snapshot",
          observed: device.status,
          numerator: null,
          denominator: null,
          metrics: null,
          device,
          records: [],
          relatedVisitors: null,
          relatedDevices: 1,
          snapshotAt: data.metadata.snapshot_at,
          incomplete: false,
        });
        continue;
      }
      const startDate =
        selection.start_date > filter.startDate
          ? selection.start_date
          : filter.startDate;
      const endDate =
        selection.end_date < filter.endDate
          ? selection.end_date
          : filter.endDate;
      if (startDate > endDate || scenario.rule.metric === "device_status")
        continue;
      checked++;
      const caseFilter = {
        startDate,
        endDate,
        locationId: selection.location_id,
      };
      const result = engine.calculate(caseFilter);
      if (!result.metrics) continue;
      const measure = measurement(scenario.rule.metric, result.metrics);
      if (
        "minimum_denominator" in scenario.rule &&
        measure.denominator < scenario.rule.minimum_denominator
      ) {
        insufficient++;
        continue;
      }
      if (measure.value === null) continue;
      const triggered =
        "equals" in scenario.rule
          ? measure.value === scenario.rule.equals
          : scenario.rule.operator === ">="
            ? measure.value >= scenario.rule.threshold
            : measure.value < scenario.rule.threshold;
      if (!triggered) continue;
      const records = result.recordIds.sessions
        .map((id) => ({
          session: sessions.get(id)!,
          job: jobs.get(id) ?? null,
        }))
        .filter((r) => related(scenario.rule.metric as BusinessMetric, r.job))
        .sort(
          (a, b) =>
            b.session.started_at.localeCompare(a.session.started_at) ||
            a.session.session_id.localeCompare(b.session.session_id),
        );
      items.push({
        scenario,
        locationName,
        filter: caseFilter,
        scope: "business",
        observed: measure.value,
        numerator: measure.numerator,
        denominator: measure.denominator,
        metrics: result.metrics,
        device: null,
        records,
        relatedVisitors: new Set(records.map((r) => r.session.visitor_id)).size,
        relatedDevices: new Set(records.map((r) => r.session.device_id)).size,
        snapshotAt: data.metadata.snapshot_at,
        incomplete: result.coverage.incompleteDates.length > 0,
      });
    }
    // Return independent detail records so consumer state cannot mutate the engine's evidence.
    return structuredClone({ items, checked, insufficient });
  }
  return { evaluate };
}
