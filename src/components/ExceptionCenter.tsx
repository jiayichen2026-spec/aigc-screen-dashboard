import { useEffect, useRef, useState } from "react";
import type { ExceptionItem } from "../lib/exceptions";
import {
  metricLabels,
  observedText,
  ruleText,
  evidenceText,
  recordScope,
  jobLabels,
  moderationLabels,
  codeLabels,
} from "../lib/exception-display";
import type { useExceptions } from "../hooks/useExceptions";
import { formatSnapshot } from "./DeviceList";
import { formatCount, formatSeconds } from "../lib/metric-format";
import Explanation from "./Explanation";

export default function ExceptionCenter({
  exceptions,
  onSelect,
}: {
  exceptions: ReturnType<typeof useExceptions>;
  onSelect: (id: string) => void;
}) {
  const { resource, retry, report } = exceptions;
  const [kind, setKind] = useState("all");
  const items =
    report?.items.filter(
      (item) => kind === "all" || item.scenario.kind === kind,
    ) ?? [];
  const anomalies =
    report?.items.filter((item) => item.scenario.kind === "anomaly").length ??
    0;
  const boundaries = report ? report.items.length - anomalies : 0;
  return (
    <section
      id="exceptions"
      tabIndex={-1}
      className="panel exceptions"
      aria-busy={resource.status === "loading"}
    >
      <div className="panel-heading">
        <div>
          <h2>异常中心</h2>
          <p>从触发依据，追查到任务与设备</p>
        </div>
        <span className="neutral-badge">
          {report
            ? `${anomalies}项异常 · ${boundaries}项数据提示`
            : resource.status === "error"
              ? "案例加载失败"
              : "正在读取案例"}
        </span>
      </div>
      <Explanation label="查看异常规则说明">
        <p>
          业务按预设案例窗口与所选日期的交集复算；设备只随点位筛选。阈值为演示配置，所有根因均待确认。
        </p>
        <p>
          同一体验可能关联多个关注项，影响人数不可直接相加。数据提示不等于已确认业务故障。
        </p>
      </Explanation>
      {resource.status === "error" ? (
        <div className="exception-error" role="alert">
          <p>{resource.message}。概览指标仍可使用。</p>
          <button className="button secondary" onClick={retry}>
            重试异常加载
          </button>
        </div>
      ) : !report ? (
        <p className="exception-scope" role="status">
          正在读取异常规则与证据…
        </p>
      ) : (
        <>
          <div className="exception-toolbar">
            <label>
              关注项类型
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">全部关注项</option>
                <option value="anomaly">异常</option>
                <option value="boundary">数据提示</option>
              </select>
            </label>
            <p aria-live="polite">
              检查{report.checked}项预设规则 · {report.insufficient}
              项样本不足未判定 · 当前显示{items.length}项
            </p>
          </div>
          <div className="table-scroll">
            <table className="exception-table">
              <caption className="sr-only">
                当前范围内满足演示规则的异常及数据提示
              </caption>
              <thead>
                <tr>
                  {[
                    "统计窗口 / 快照",
                    "活动点位",
                    "关注项",
                    "观察结果",
                    "详情",
                  ].map((text) => (
                    <th key={text} scope="col">
                      {text}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item) => (
                    <tr key={item.scenario.scenario_id}>
                      <td>
                        {item.scope === "snapshot"
                          ? formatSnapshot(item.snapshotAt)
                          : `${item.filter.startDate} 至 ${item.filter.endDate}`}
                        <small>
                          {item.scope === "snapshot"
                            ? "设备快照 · 不受日期筛选"
                            : `体验开始日归属${item.incomplete ? " · 当日未结束" : ""}`}
                        </small>
                      </td>
                      <td>{item.locationName}</td>
                      <td>
                        <span className={`case-kind ${item.scenario.kind}`}>
                          {item.scenario.kind === "anomaly"
                            ? "异常"
                            : "数据提示"}
                        </span>
                        <strong>
                          {metricLabels[item.scenario.rule.metric]}
                        </strong>
                        <small>{item.scenario.title}</small>
                      </td>
                      <td>
                        <strong>
                          {observedText(
                            item.scenario.rule.metric,
                            item.observed,
                          )}
                        </strong>
                        <small>{ruleText(item.scenario.rule)}</small>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          aria-label={`查看${item.scenario.title}详情`}
                          onClick={() => onSelect(item.scenario.scenario_id)}
                        >
                          查看详情 →
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <strong>
                          当前范围与类型下没有满足预设规则的关注项
                        </strong>
                        <span>
                          可调整日期、点位或类型；这不代表不存在其他潜在异常。
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="panel-footnote">
            根因待确认；窄屏可横向滑动表格查看完整信息。
          </p>
        </>
      )}
    </section>
  );
}

export function ExceptionDialog({
  item,
  onClose,
  onLocate,
}: {
  item: ExceptionItem;
  onClose: () => void;
  onLocate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(item.records.length / pageSize));
  const rows = item.records.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const span =
    item.scope === "snapshot"
      ? `${formatSnapshot(item.snapshotAt)}（北京时间快照）`
      : `${item.filter.startDate} 至 ${item.filter.endDate}（体验开始日）`;
  return (
    <dialog
      ref={dialog}
      className="definitions exception-dialog"
      aria-labelledby="exception-title"
      onClose={() => {
        // StrictMode cleanup may queue a close event before the dialog reopens.
        if (!dialog.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">EXCEPTION DETAILS</p>
          <h2 id="exception-title">{item.scenario.title}</h2>
        </div>
        <button
          className="close-button"
          aria-label="关闭异常详情"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      <p className="dialog-intro">
        {item.locationName} · {span}
      </p>
      <div className="exception-evidence">
        <span>{metricLabels[item.scenario.rule.metric]}</span>
        <strong>
          {observedText(item.scenario.rule.metric, item.observed)}
        </strong>
        <p>触发条件：{ruleText(item.scenario.rule)}</p>
        <p>{evidenceText(item)}</p>
      </div>
      {item.scope === "business" ? (
        <p className="dialog-note">
          关联范围：{item.records.length}条{recordScope(item)}，涉及
          {formatCount(item.relatedVisitors)}位去重用户、{item.relatedDevices}
          台设备。关联范围用于追查，不表示每位用户均受损。结果统一观察至
          {formatSnapshot(item.snapshotAt)}。
          {item.incomplete && "所选范围包含尚未结束的自然日。"}
        </p>
      ) : (
        <p className="dialog-note">
          涉及1台设备；仅凭心跳无法推断受影响人数或已确认故障持续时长。当前业务日期不影响这个快照。
        </p>
      )}
      <div className="investigation-grid">
        <section>
          <h3>可能原因 · 尚未确认</h3>
          <p>{item.scenario.suspected_cause}</p>
        </section>
        <section>
          <h3>建议采取的行动</h3>
          <p>{item.scenario.suggested_action}</p>
        </section>
      </div>
      {item.device ? (
        <dl className="device-evidence">
          <div>
            <dt>设备</dt>
            <dd>
              {item.device.name} · {item.device.device_id}
            </dd>
          </div>
          <div>
            <dt>最近心跳</dt>
            <dd>
              {item.device.last_heartbeat_at
                ? formatSnapshot(item.device.last_heartbeat_at)
                : "无记录"}
            </dd>
          </div>
          <div>
            <dt>判定口径</dt>
            <dd>
              距快照5分钟内有心跳为在线，超过5分钟为离线；缺失心跳为未知。
            </dd>
          </div>
        </dl>
      ) : (
        <section className="record-evidence">
          <h3>关联明细 · {recordScope(item)}</h3>
          {item.records.length ? (
            <>
              <p>
                按体验开始时间倒序；点击记录可展开生成尝试、审核与扫码证据。时间均为北京时间。
              </p>
              <ul>
                {rows.map(({ session, job }) => (
                  <li key={session.session_id}>
                    <details>
                      <summary>
                        <span>
                          {session.session_id}
                          <small>
                            {session.device_id} ·{" "}
                            {formatSnapshot(session.started_at)}
                          </small>
                        </span>
                        <span>
                          {job ? jobLabels[job.status] : "未提交任务"}
                        </span>
                      </summary>
                      <div className="record-body">
                        <p>逻辑任务：{job?.generation_id ?? "无"}</p>
                        {job && (
                          <>
                            <p>
                              提交：{formatSnapshot(job.submitted_at)}；结束：
                              {job.completed_at
                                ? formatSnapshot(job.completed_at)
                                : "未结束"}
                              ；总耗时：
                              {formatSeconds(
                                job.duration_ms === null
                                  ? null
                                  : job.duration_ms / 1000,
                              )}
                              秒
                            </p>
                            <p>
                              失败原因：
                              {job.failure_code
                                ? `${codeLabels[job.failure_code] ?? job.failure_code}（${job.failure_code}）`
                                : "无最终失败"}
                              ；审核：{moderationLabels[job.moderation_status]}
                              {job.moderation_reason &&
                                ` · ${codeLabels[job.moderation_reason] ?? job.moderation_reason}`}
                            </p>
                            <p>
                              审核时间：
                              {job.reviewed_at
                                ? formatSnapshot(job.reviewed_at)
                                : "无"}
                              ；结果展示：
                              {job.result_displayed_at
                                ? formatSnapshot(job.result_displayed_at)
                                : "未展示"}
                              ；扫码：{job.scan_events.length}
                              次事件（会话转化最多计1次）
                            </p>
                            {job.moderation_status === "pending" &&
                              job.completed_at && (
                                <p>
                                  生成完成后已等待审核{" "}
                                  {formatSeconds(
                                    (Date.parse(item.snapshotAt) -
                                      Date.parse(job.completed_at)) /
                                      60000,
                                  )}{" "}
                                  分钟（截至快照）
                                </p>
                              )}
                            <p>
                              内部生成尝试：{job.attempts.length}
                              次，始终计为1个逻辑任务
                            </p>
                            <ol>
                              {job.attempts.map((attempt) => (
                                <li key={attempt.attempt_id}>
                                  {attempt.attempt_id}：
                                  {formatSnapshot(attempt.started_at)} →{" "}
                                  {attempt.ended_at
                                    ? formatSnapshot(attempt.ended_at)
                                    : "尚未结束"}{" "}
                                  · {jobLabels[attempt.status]}
                                  {attempt.failure_code &&
                                    ` · ${codeLabels[attempt.failure_code] ?? attempt.failure_code}`}
                                </li>
                              ))}
                            </ol>
                            {job.scan_events.length > 0 && (
                              <p>
                                扫码时间：
                                {job.scan_events
                                  .map((scan) =>
                                    formatSnapshot(scan.scanned_at),
                                  )
                                  .join("、")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              <div className="evidence-pagination">
                <button
                  className="button secondary"
                  disabled={page === 0}
                  onClick={() => setPage((n) => n - 1)}
                >
                  上一页
                </button>
                <span aria-live="polite">
                  第{page + 1}/{pages}页 · 共{item.records.length}条
                </span>
                <button
                  className="button secondary"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((n) => n + 1)}
                >
                  下一页
                </button>
              </div>
            </>
          ) : (
            <p>
              该窗口没有体验记录，因此没有可追查的生成任务；不能由此推断设备离线。
            </p>
          )}
        </section>
      )}
      <div className="exception-actions">
        <button
          className="button secondary"
          onClick={() => dialog.current?.close()}
        >
          关闭
        </button>
        <button className="button primary" onClick={onLocate}>
          {item.scope === "snapshot"
            ? "在概览中查看该点位"
            : "在概览中查看此范围"}
        </button>
      </div>
    </dialog>
  );
}
