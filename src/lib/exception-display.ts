import type { ExceptionItem, Scenario } from "./exceptions.ts";
import { formatPercent, formatCount, formatSeconds } from "./metric-format.ts";

export const metricLabels = {
  generation_failure_rate: "生成失败率",
  average_success_duration_seconds: "成功任务平均耗时",
  scan_conversion_rate: "扫码转化率",
  moderation_block_rate: "审核拦截率",
  moderation_pending_count: "待审核数",
  session_count: "体验数",
  device_status: "设备心跳状态",
};
export const jobLabels = {
  success: "生成成功",
  failed: "生成失败",
  queued: "排队中",
  processing: "处理中",
};
export const moderationLabels = {
  passed: "通过",
  blocked: "拦截",
  pending: "待审核",
  not_applicable: "不适用",
};
export const codeLabels: Record<string, string> = {
  GENERATION_TIMEOUT: "生成超时",
  SERVICE_UNAVAILABLE: "服务不可用",
  INVALID_OUTPUT: "输出无效",
  UNSAFE_CONTENT: "内容安全风险",
  PERSONAL_INFORMATION_RISK: "个人信息风险",
  BRAND_POLICY_REVIEW: "品牌规则复核",
};
export function observedText(
  metric: Scenario["rule"]["metric"],
  value: number | string,
) {
  if (metric === "device_status") return value === "offline" ? "离线" : "未知";
  if (metric.endsWith("_rate")) return `${formatPercent(Number(value))}%`;
  if (metric === "average_success_duration_seconds")
    return `${formatSeconds(Number(value))}秒`;
  return `${formatCount(Number(value))}${metric === "moderation_pending_count" ? "个" : "次"}`;
}
export function ruleText(rule: Scenario["rule"]) {
  if ("equals" in rule) return `等于${observedText(rule.metric, rule.equals)}`;
  return `${rule.operator === ">=" ? "≥" : "<"} ${observedText(rule.metric, rule.threshold)}${rule.minimum_denominator ? `，有效样本至少${rule.minimum_denominator}个` : ""}`;
}
export function evidenceText(item: ExceptionItem) {
  const m = item.metrics;
  if (!m)
    return item.device?.last_heartbeat_at
      ? `距快照 ${formatSeconds(item.device.heartbeatAgeSeconds! / 60)} 分钟未收到心跳；不代表已确认故障时长`
      : "没有心跳记录，不能直接判断为离线";
  switch (item.scenario.rule.metric) {
    case "generation_failure_rate":
      return `${m.generation.failed}失败 / ${m.generation.ended}已结束；排队和处理中不计入分母`;
    case "average_success_duration_seconds":
      return `${formatSeconds(m.generation.successfulDurationMs / 1000)}秒总耗时 / ${m.generation.succeeded}成功任务（含排队和内部重试）`;
    case "scan_conversion_rate":
      return `${m.conversion.scannedSessions}扫码会话 / ${m.conversion.eligibleSessions}可领取会话；重复扫码只计一次`;
    case "moderation_block_rate":
      return `${m.moderation.blocked}拦截 / ${m.moderation.reviewed}已审核；待审核不计入分母`;
    case "moderation_pending_count":
      return `${m.moderation.pending}个已生成但尚未审核的结果，仍不可领取`;
    default:
      return `${m.sessions}次体验 / ${m.participants}位去重参与者`;
  }
}
export function recordScope(item: ExceptionItem) {
  switch (item.scenario.rule.metric) {
    case "generation_failure_rate":
      return "失败任务";
    case "average_success_duration_seconds":
      return "参与均值计算的成功任务（并非每条都超时）";
    case "scan_conversion_rate":
      return "已展示但未扫码的会话";
    case "moderation_block_rate":
      return "审核拦截任务";
    case "moderation_pending_count":
      return "待审核任务";
    default:
      return "该范围的体验";
  }
}
