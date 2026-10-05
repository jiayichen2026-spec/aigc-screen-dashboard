import type { CSSProperties } from "react";
import type { DashboardCalculation } from "../lib/metrics";
import { formatCount, formatPercent } from "../lib/metric-format";
import { formatSnapshot } from "./DeviceList";
import Explanation from "./Explanation";

const suggestions = {
  started: "结合现场记录检查体验入口与引导，不能仅凭次数确认体验意愿。",
  submitted: "检查生成入口、提交交互与事件采集，结合现场反馈核查未提交原因。",
  succeeded: "按失败代码及重试记录排查；排队和处理中继续关注等待情况。",
  approved: "拦截时复核风险分类；待审核时检查审核队列及等待时间。",
  displayed: "检查结果展示链路和展示事件采集，不能直接认定页面或设备故障。",
  scanned: "检查二维码展示、扫码引导及事件采集，不能直接认定用户放弃。",
};

export default function ConversionFunnel({
  result,
  unavailableText,
}: {
  result: DashboardCalculation | null;
  unavailableText: string;
}) {
  const stages = result?.funnel;
  const started = stages?.[0].count ?? 0;
  return (
    <section className="panel conversion-funnel" aria-labelledby="funnel-title">
      <div className="panel-heading">
        <div>
          <h2 id="funnel-title">完整转化漏斗</h2>
          <p>按体验 ID 计次 · 转化率分母为上一阶段</p>
        </div>
      </div>
      <Explanation label="查看漏斗指标口径">
        <p>
          每阶段为体验次数，同一体验最多计一次，重试和重复扫码不重复计数。
          按北京时间的体验开始日及点位筛选，后续阶段属于前序同一批体验。
          {result &&
            `状态统一观察至 ${formatSnapshot(result.coverage.observedThrough)}（北京时间）。`}
        </p>
        <p>
          色条按“开始体验”次数等比例展示；下方转化率的分母均为上一阶段次数。
        </p>
        <p>
          漏斗“生成成功”以全部已提交体验为分母，包含排队和处理中；“审核通过”以全部生成成功体验为分母，包含待审核。与上方排除未结束状态的成功率、审核通过率口径不同。扫码领取仅代表存在扫码事件，不代表下载或购买完成。
        </p>
        <p>
          从开始体验到扫码领取，核对每一步尚未继续的体验；差额分类表示尚未到达本阶段的状态。
        </p>
      </Explanation>
      {!result ? (
        <p className="funnel-state" role="status">
          {unavailableText}
        </p>
      ) : !stages ? (
        <p className="funnel-state" role="status">
          当前筛选范围没有日期数据覆盖，漏斗暂无数据；不代表各阶段为 0。
        </p>
      ) : (
        <>
          {started === 0 && (
            <p className="funnel-state" role="status">
              当前筛选范围暂无体验记录：各阶段为 0 次，分母为零的转化率显示“—”。
            </p>
          )}
          {result.coverage.dateRange === "partial" && (
            <p className="funnel-state">
              仅统计已有覆盖日期，未覆盖日期不计为 0。
            </p>
          )}
          {result.coverage.incompleteDates.length > 0 && (
            <p className="funnel-note">
              所选范围包含未结束日，未完成状态仍可能变化；差额不等于最终失败或流失。
            </p>
          )}
          <ol className="funnel-stages">
            {stages.map((stage, index) => (
              <li className="funnel-stage" key={stage.id} data-stage={stage.id}>
                <h3>
                  <span>{index + 1}</span>
                  {stage.label}
                  {index < stages.length - 1 && (
                    <span className="funnel-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </h3>
                <p className="funnel-count">
                  <strong>{formatCount(stage.count)}</strong> 次体验
                </p>
                <div className="funnel-bar" aria-hidden="true">
                  <i
                    style={
                      {
                        "--funnel-share": `${started ? (stage.count / started) * 100 : 0}%`,
                      } as CSSProperties
                    }
                  />
                </div>
                <div className="funnel-rate">
                  <strong>
                    {stage.conversionRate === null
                      ? "—"
                      : `${formatPercent(stage.conversionRate)}%`}
                  </strong>
                  <span>
                    {index === 0
                      ? "漏斗入口，无上一阶段"
                      : `相对${stages[index - 1].label}`}
                  </span>
                  <small>
                    {index === 0
                      ? "分母：—"
                      : `${formatCount(stage.count)} ÷ ${formatCount(stage.previousCount)}（分母）`}
                  </small>
                </div>
                <div className="funnel-gap">
                  <p>
                    与上阶段差额：
                    <strong>{formatCount(stage.difference)}</strong>
                    {index > 0 && " 次"}
                  </p>
                  {index === 0 ? (
                    <p className="funnel-entry-note">起始阶段，无差额分类。</p>
                  ) : (
                    <>
                      <p className="funnel-entry-note">差额状态：</p>
                      <ul>
                        {stage.breakdown.map((group) => (
                          <li key={group.label}>
                            <span>{group.label}</span>
                            <strong>{formatCount(group.count)} 次</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <p className="funnel-suggestion">
                  <strong>排查建议 · 非确认原因</strong>
                  {suggestions[stage.id]}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
