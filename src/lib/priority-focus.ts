import type { ExceptionItem } from "./exceptions.ts";
import { formatCount } from "./metric-format.ts";

/** Presentation ordering only: all trigger decisions belong to the exception engine. */
export function priorityItems(items: ExceptionItem[]) {
  return items
    .filter((item) => item.scenario.kind === "anomaly")
    .sort(
      (a, b) =>
        Number(b.scope === "snapshot") - Number(a.scope === "snapshot") ||
        (b.scope === "snapshot"
          ? b.snapshotAt
          : b.filter.endDate
        ).localeCompare(
          a.scope === "snapshot" ? a.snapshotAt : a.filter.endDate,
        ) ||
        b.records.length - a.records.length ||
        a.scenario.scenario_id.localeCompare(b.scenario.scenario_id),
    )
    .slice(0, 3);
}

export function focusScope(item: ExceptionItem) {
  const count = formatCount(item.records.length);
  switch (item.scenario.rule.metric) {
    case "device_status":
      return `涉及 ${formatCount(item.relatedDevices)} 台设备；无法由心跳推断影响任务量`;
    case "generation_failure_rate":
      return `实际失败 ${count} 个任务 / 窗口内 ${formatCount(item.denominator)} 个已结束任务`;
    case "average_success_duration_seconds":
      return `窗口内 ${count} 个成功任务参与均值；不代表每个任务均超时`;
    case "scan_conversion_rate":
      return `窗口内 ${formatCount(item.denominator)} 个可领取任务，其中 ${count} 个未扫码；不等于任务故障`;
    case "moderation_block_rate":
      return `实际拦截 ${count} 个任务 / 窗口内 ${formatCount(item.denominator)} 个已审核任务`;
    case "moderation_pending_count":
      return `实际待审核 ${count} 个任务，尚不可领取`;
    default:
      return `窗口内 ${count} 条体验记录`;
  }
}
