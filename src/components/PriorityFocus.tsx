import type { useExceptions } from "../hooks/useExceptions";
import type { DashboardCalculation } from "../lib/metrics";
import { metricLabels, observedText, ruleText } from "../lib/exception-display";
import { focusScope, priorityItems } from "../lib/priority-focus";
import { formatSeconds } from "../lib/metric-format";
import { formatSnapshot } from "./DeviceList";

export default function PriorityFocus({
  exceptions,
  result,
  unavailableText,
  heartbeatThresholdSeconds,
  onSelect,
}: {
  exceptions: ReturnType<typeof useExceptions>;
  result: DashboardCalculation | null;
  unavailableText: string;
  heartbeatThresholdSeconds: number | null;
  onSelect: (id: string) => void;
}) {
  const { report, resource, retry } = exceptions;
  const items = priorityItems(report?.items ?? []);
  const noBusinessData =
    result && (!result.metrics || result.metrics.sessions === 0);
  return (
    <section
      className="panel priority-focus"
      aria-labelledby="focus-title"
      aria-busy={!result || resource.status === "loading"}
    >
      <div className="panel-heading">
        <h2 id="focus-title">重点关注</h2>
        <span className="neutral-badge">最多 3 项 · 根因待核查</span>
      </div>
      <p className="focus-explanation">
        设备离线优先；业务按窗口结束日期从近到远，同日按关联记录数从多到少，最后按案例编号排序。仅展示已触发的异常，排序不代表严重程度。
      </p>
      {!result ? (
        <p className="focus-state" role="status">
          {unavailableText}
        </p>
      ) : resource.status === "error" ? (
        <div className="focus-state" role="alert">
          <p>{resource.message}，暂无法判断重点异常。</p>
          <button className="button secondary" onClick={retry}>
            重试重点关注
          </button>
        </div>
      ) : !report ? (
        <p className="focus-state" role="status">
          正在读取异常规则与证据…
        </p>
      ) : (
        <>
          {noBusinessData && (
            <p className="focus-state" role="status">
              {result.metrics
                ? "当前筛选范围内暂无体验记录，无法判断业务异常。"
                : "当前筛选范围内暂无业务数据，所选日期未覆盖。"}
              设备仍按独立快照判断。
            </p>
          )}
          {!items.length && !noBusinessData && (
            <p className="focus-state" role="status">
              当前筛选范围内暂无异常
            </p>
          )}
          {items.length > 0 && (
            <ul className="focus-list">
              {items.map((item) => (
                <li className="focus-card" key={item.scenario.scenario_id}>
                  <div className="focus-card-heading">
                    <strong>{item.locationName}</strong>
                    <button
                      className="text-button"
                      onClick={() => onSelect(item.scenario.scenario_id)}
                      aria-label={`重点关注：查看${item.scenario.title}详情`}
                    >
                      查看详情 →
                    </button>
                  </div>
                  <p className="focus-window">
                    {item.scope === "snapshot"
                      ? `${formatSnapshot(item.snapshotAt)} · 设备快照，不随日期筛选`
                      : `${item.filter.startDate} 至 ${item.filter.endDate}${item.incomplete ? " · 当日未结束" : ""}`}
                  </p>
                  <p className="focus-observed">
                    {metricLabels[item.scenario.rule.metric]}{" "}
                    <strong>
                      {observedText(item.scenario.rule.metric, item.observed)}
                    </strong>
                  </p>
                  <p className="focus-rule">
                    判定：
                    {item.scope === "snapshot"
                      ? `距快照超过 ${formatSeconds(heartbeatThresholdSeconds === null ? null : heartbeatThresholdSeconds / 60)} 分钟无心跳；当前 ${formatSeconds(item.device?.heartbeatAgeSeconds == null ? null : item.device.heartbeatAgeSeconds / 60)} 分钟`
                      : ruleText(item.scenario.rule)}
                  </p>
                  <p className="focus-impact">范围：{focusScope(item)}</p>
                  <p className="focus-action">
                    建议：{item.scenario.suggested_action}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="focus-explanation focus-footnote">
            业务按案例窗口与所选日期交集复算；设备仅随点位筛选。时间均为北京时间。阈值为演示配置，数据提示与完整证据见异常中心。
          </p>
        </>
      )}
    </section>
  );
}
