import { useMemo, useRef, useState } from "react";
import Icon from "./components/Icon";
import TrendChart from "./components/TrendChart";
import { locations, metricDefinitions } from "./data/catalog";
import { useDashboardData } from "./hooks/useDashboardData";
import { formatCount, formatPercent, formatSeconds } from "./lib/metric-format";
import DeviceList, { formatSnapshot } from "./components/DeviceList";
import ExceptionCenter, { ExceptionDialog } from "./components/ExceptionCenter";
import PriorityFocus from "./components/PriorityFocus";
import ConversionFunnel from "./components/ConversionFunnel";
import Explanation from "./components/Explanation";
import { useExceptions } from "./hooks/useExceptions";
import type { ExceptionItem } from "./lib/exceptions";

const navigation = [
  { id: "overview", label: "运营概览", icon: "overview" },
  { id: "moderation", label: "内容审核", icon: "shield" },
  { id: "devices", label: "设备状态", icon: "screen" },
  { id: "exceptions", label: "异常中心", icon: "alert" },
] as const;

export default function App() {
  const { resource, retry } = useDashboardData();
  const data = resource.status === "ready" ? resource.data : null;
  const [customRange, setCustomRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [filterError, setFilterError] = useState("");
  const [location, setLocation] = useState("all");
  const [period, setPeriod] = useState("7");
  const [activeSection, setActiveSection] = useState("overview");
  const definitions = useRef<HTMLDialogElement>(null);
  const siteOptions = data
    ? [{ id: "all", name: "全部点位" }, ...data.metadata.locations]
    : locations;
  const locationName =
    siteOptions.find((item) => item.id === location)?.name ?? "全部点位";
  const result = useMemo(() => {
    if (!data) return null;
    const range =
      period === "custom" && customRange
        ? customRange
        : data.engine.defaultFilter(Number(period === "custom" ? "7" : period));
    return data.engine.calculate({ ...range, locationId: location });
  }, [data, period, customRange, location]);
  const exceptions = useExceptions(
    data?.dataset ?? null,
    result?.filter ?? null,
  );
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(
    null,
  );
  const selectedException = exceptions.report?.items.find(
    (item) => item.scenario.scenario_id === selectedExceptionId,
  );
  const metrics = result?.metrics ?? null;
  const unavailableText =
    resource.status === "error" ? "数据加载失败，请重试" : "正在读取模拟数据…";
  const values = [
    formatCount(metrics?.participants ?? null),
    formatPercent(metrics?.generation.successRate ?? null),
    formatPercent(metrics?.conversion.rate ?? null),
    formatSeconds(metrics?.generation.averageSeconds ?? null),
  ];
  const evidence = metrics
    ? [
        `${formatCount(metrics.sessions)}次体验 · 范围内重新去重`,
        `${formatCount(metrics.generation.succeeded)}成功 / ${formatCount(metrics.generation.ended)}已结束`,
        `${formatCount(metrics.conversion.scannedSessions)}扫码 / ${formatCount(metrics.conversion.eligibleSessions)}可领取`,
        `${formatCount(metrics.generation.succeeded)}个成功任务 · 包含排队`,
      ]
    : Array(4).fill(result ? "所选日期没有数据覆盖" : unavailableText);
  const reset = () => {
    setLocation("all");
    setPeriod("7");
    setCustomRange(null);
    setFilterError("");
  };
  const applyDates = () => {
    if (!data) return;
    try {
      data.engine.calculate({
        startDate: draftStart,
        endDate: draftEnd,
        locationId: location,
      });
      setCustomRange({ startDate: draftStart, endDate: draftEnd });
      setFilterError("");
    } catch (error) {
      setFilterError(error instanceof Error ? error.message : "日期范围无效");
    }
  };

  const locateException = (item: ExceptionItem) => {
    setLocation(item.filter.locationId);
    if (item.scope === "business") {
      setPeriod("custom");
      setCustomRange({
        startDate: item.filter.startDate,
        endDate: item.filter.endDate,
      });
      setDraftStart(item.filter.startDate);
      setDraftEnd(item.filter.endDate);
    }
    setFilterError("");
    setActiveSection("overview");
    document.getElementById("overview")?.scrollIntoView();
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <Icon name="activity" />
          </span>
          <span>
            ScreenPulse<small>互动大屏运营平台</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">S</span>
          <span>
            品牌活动工作台<small>演示空间</small>
          </span>
          <span className="workspace-chevron">⌄</span>
        </div>
        <p className="nav-label">工作空间</p>
        <nav aria-label="主要导航">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={
                activeSection === item.id ? "nav-link active" : "nav-link"
              }
              aria-current={activeSection === item.id ? "location" : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "overview" && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small-pill">DEMO WORKSPACE</span>
          <p>
            看见每一次互动
            <br />
            连接体验与运营决策
          </p>
          <div className="sidebar-version">
            数据演示 <span>v0.3</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <span>/</span> <strong>运营概览</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <i />
              模拟数据模式
            </span>
            <span className="avatar" aria-label="运营人员">
              运
            </span>
          </div>
        </header>
        <main id="main" aria-busy={resource.status === "loading"}>
          <section id="overview" className="overview">
            <div className="page-heading">
              <div>
                <p className="eyebrow">OPERATIONS OVERVIEW</p>
                <h1>AIGC 运营看板</h1>
                <p className="subtitle">
                  从每一次互动，了解活动效果与服务表现。
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => definitions.current?.showModal()}
              >
                <Icon name="info" />
                指标口径
              </button>
            </div>
            <div
              className={`notice ${resource.status === "error" ? "notice-error" : ""}`}
              role={resource.status === "error" ? "alert" : "status"}
            >
              <span className="notice-icon">
                <Icon name="info" />
              </span>
              <div>
                <strong>
                  {data
                    ? `模拟数据已接入 · 截至 ${formatSnapshot(data.metadata.snapshot_at)}（北京时间）`
                    : unavailableText}
                </strong>
                {data ? (
                  <Explanation label="查看模拟数据说明">
                    <p>
                      可复现模拟数据：所有点位与用户均为虚构。最近7天／30天以数据快照为准，快照当日仅统计至上述截止时刻。
                    </p>
                  </Explanation>
                ) : (
                  <p>
                    {resource.status === "error"
                      ? `${resource.message}。未使用0代替读取失败的数据。`
                      : "正在加载体验、生成任务和设备快照，请稍候。"}
                  </p>
                )}
              </div>
              {resource.status === "error" ? (
                <button className="button secondary" onClick={retry}>
                  重新加载
                </button>
              ) : !data ? (
                <span className="notice-tag">加载中</span>
              ) : null}
            </div>
            <div className="filter-bar">
              <div className="filters">
                <label>
                  统计周期
                  <select
                    value={period}
                    disabled={!data}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "custom" && result) {
                        setCustomRange({
                          startDate: result.filter.startDate,
                          endDate: result.filter.endDate,
                        });
                        setDraftStart(result.filter.startDate);
                        setDraftEnd(result.filter.endDate);
                      }
                      setPeriod(next);
                      setFilterError("");
                    }}
                  >
                    <option value="7">最近 7 天</option>
                    <option value="30">最近 30 天</option>
                    <option value="custom">自定义日期</option>
                  </select>
                </label>
                <label>
                  活动点位
                  <select
                    value={location}
                    disabled={!data}
                    onChange={(event) => setLocation(event.target.value)}
                  >
                    {siteOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="reset" onClick={reset}>
                  重置
                </button>
              </div>
              <span className="timezone">北京时间 · UTC+8</span>
            </div>
            {period === "custom" && (
              <form
                className="custom-dates"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyDates();
                }}
              >
                <label>
                  开始日期
                  <input
                    type="date"
                    required
                    value={draftStart}
                    onChange={(event) => setDraftStart(event.target.value)}
                  />
                </label>
                <label>
                  结束日期
                  <input
                    type="date"
                    required
                    value={draftEnd}
                    onChange={(event) => setDraftEnd(event.target.value)}
                  />
                </label>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={!data}
                >
                  应用日期
                </button>
                <p>选择后点击应用，最多366天</p>
              </form>
            )}
            {filterError && (
              <p className="filter-error" role="alert">
                {filterError}。当前仍显示上次有效范围。
              </p>
            )}
            <p className="filter-summary" aria-live="polite">
              <Icon name="location" />
              {locationName}
              <span>·</span>
              {period === "custom" ? "自定义日期" : `最近 ${period} 天`}
              <span>·</span>
              {result
                ? `${result.filter.startDate} 至 ${result.filter.endDate}`
                : "正在读取日期范围"}
            </p>
            {result && (
              <div className="coverage-notes" aria-live="polite">
                {result.coverage.dateRange !== "within" && (
                  <p>
                    所选日期
                    {result.coverage.dateRange === "outside"
                      ? "没有"
                      : "仅部分有"}
                    数据覆盖；可用范围为 {result.coverage.availableStartDate} 至{" "}
                    {result.coverage.availableEndDate}，未覆盖日期不计为0。
                  </p>
                )}
                {result.coverage.incompleteDates.length > 0 && (
                  <p>
                    {result.coverage.incompleteDates.join("、")}{" "}
                    尚未结束，统计截至{" "}
                    {formatSnapshot(result.coverage.observedThrough).slice(
                      11,
                      16,
                    )}
                    ，请勿直接与完整自然日比较。
                  </p>
                )}
                {metrics && metrics.sessions === 0 && (
                  <p>
                    所选范围暂无体验记录。比例和平均时长显示“—”；设备仍展示独立快照。
                  </p>
                )}
                {metrics && metrics.sessions > 0 && metrics.sessions < 30 && (
                  <p>
                    样本量较少（{metrics.sessions}
                    次体验），比例仅供观察，请谨慎比较。
                  </p>
                )}
              </div>
            )}
            <PriorityFocus
              exceptions={exceptions}
              result={result}
              unavailableText={unavailableText}
              heartbeatThresholdSeconds={
                data?.metadata.online_threshold_seconds ?? null
              }
              onSelect={setSelectedExceptionId}
            />
            <div className="metrics">
              {metricDefinitions.slice(0, 4).map((metric, index) => (
                <article className="metric-card" key={metric.name}>
                  <div className="metric-label">
                    {metric.name}
                    <span className="metric-index">0{index + 1}</span>
                  </div>
                  <div className="metric-value">
                    {values[index]}
                    <span>{["人", "%", "%", "秒"][index]}</span>
                  </div>
                  <p>
                    {
                      [
                        "按匿名用户去重",
                        "统计已结束生成任务",
                        "从可领取结果到扫码",
                        "含排队与内部重试",
                      ][index]
                    }
                  </p>
                  <span className="metric-status">{evidence[index]}</span>
                </article>
              ))}
            </div>
            {metrics && (
              <p className="generation-summary">
                任务进度：{formatCount(metrics.generation.failed)}失败 ·{" "}
                {formatCount(metrics.generation.queued)}排队 ·{" "}
                {formatCount(metrics.generation.processing)}处理中
                <span>未结束任务不计入成功率分母</span>
              </p>
            )}
            <div className="analytics-grid">
              <section className="panel trend-panel">
                <div className="panel-heading">
                  <div>
                    <h2>活动趋势</h2>
                    <p>观察参与规模与生成服务的变化</p>
                  </div>
                  <div className="chart-legends">
                    <span className="legend">
                      <i />
                      参与人数
                    </span>
                    <span className="legend success-legend">
                      <i />
                      成功率
                    </span>
                  </div>
                </div>
                <TrendChart result={result} unavailableText={unavailableText} />
              </section>
              <section className="panel location-panel">
                <div className="panel-heading">
                  <div>
                    <h2>点位表现</h2>
                    <p>发现各个活动现场的差异</p>
                  </div>
                  <span className="panel-icon">
                    <Icon name="location" />
                  </span>
                </div>
                <div className="location-list">
                  {result ? (
                    result.locations.map((item, index) => (
                      <div className="location-row" key={item.id}>
                        <span className="location-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {item.metrics
                              ? `${formatCount(item.metrics.sessions)}次体验 · 成功率 ${formatPercent(item.metrics.generation.successRate)}%`
                              : "所选日期未覆盖"}
                          </span>
                        </div>
                        <span className="location-value">
                          {formatCount(item.metrics?.participants ?? null)}
                          <small>人</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="section-placeholder">{unavailableText}</p>
                  )}
                </div>
                <div className="panel-footnote">
                  每个点位独立去重；各点位人数之和可能大于总览人数
                </div>
              </section>
            </div>
            <ConversionFunnel
              result={result}
              unavailableText={unavailableText}
            />
          </section>
          <div className="health-grid">
            <section id="moderation" className="panel">
              <div className="panel-heading">
                <div>
                  <h2>内容审核</h2>
                  <p>生成成功之后，确认结果是否可交付</p>
                </div>
                <span className="panel-icon">
                  <Icon name="shield" />
                </span>
              </div>
              <div className="status-grid">
                {["审核通过", "审核拦截", "待审核"].map((text, index) => (
                  <div key={text}>
                    <span className={`status-label status-${index}`}>
                      <i />
                      {text}
                    </span>
                    <strong>
                      {formatCount(
                        metrics
                          ? [
                              metrics.moderation.passed,
                              metrics.moderation.blocked,
                              metrics.moderation.pending,
                            ][index]
                          : null,
                      )}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="panel-footnote">
                审核通过率 {formatPercent(metrics?.moderation.passRate ?? null)}
                % · 已审核 {formatCount(metrics?.moderation.reviewed ?? null)}{" "}
                个结果；待审核不进入分母
              </p>
            </section>
            <section id="devices" className="panel">
              <div className="panel-heading">
                <div>
                  <h2>设备状态</h2>
                  <p>
                    仅跟随点位筛选 ·{" "}
                    {result
                      ? formatSnapshot(result.devices.asOf)
                      : "快照加载中"}
                  </p>
                </div>
                <span className="panel-icon">
                  <Icon name="screen" />
                </span>
              </div>
              <div className="status-grid">
                {["在线设备", "离线设备", "状态未知"].map((text, index) => (
                  <div key={text}>
                    <span className={`status-label status-${index}`}>
                      <i />
                      {text}
                    </span>
                    <strong>
                      {formatCount(
                        result
                          ? [
                              result.devices.online,
                              result.devices.offline,
                              result.devices.unknown,
                            ][index]
                          : null,
                      )}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="panel-footnote">
                当前点位：{locationName} · 无心跳不等于离线
              </p>
              {result && <DeviceList snapshot={result.devices} />}
            </section>
          </div>
          {data && result ? (
            <ExceptionCenter
              exceptions={exceptions}
              onSelect={setSelectedExceptionId}
            />
          ) : (
            <section id="exceptions" className="panel">
              <div className="panel-heading">
                <h2>异常中心</h2>
              </div>
              <p className="section-placeholder exception-scope">
                {unavailableText}；明细就绪后再进行异常判断。
              </p>
            </section>
          )}
          <footer className="footer">
            <span>ScreenPulse · AIGC 互动大屏运营看板</span>
            <span>模拟演示 / 数据看板 v0.3</span>
          </footer>
        </main>
      </div>
      {selectedException && (
        <ExceptionDialog
          key={selectedException.scenario.scenario_id}
          item={selectedException}
          onClose={() => setSelectedExceptionId(null)}
          onLocate={() => {
            setSelectedExceptionId(null);
            locateException(selectedException);
          }}
        />
      )}
      <dialog
        ref={definitions}
        className="definitions"
        aria-labelledby="definitions-title"
        onClick={(event) => {
          if (event.target === event.currentTarget)
            definitions.current?.close();
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">METRIC DEFINITIONS</p>
            <h2 id="definitions-title">指标口径</h2>
          </div>
          <button
            className="close-button"
            aria-label="关闭指标口径"
            onClick={() => definitions.current?.close()}
          >
            ×
          </button>
        </div>
        <p className="dialog-intro">
          所有指标由模拟明细计算。分母为零或日期未覆盖时显示“—”，不代表0%。
        </p>
        <dl>
          {metricDefinitions.map((metric) => (
            <div key={metric.name}>
              <dt>{metric.name}</dt>
              <dd>
                {metric.formula}
                <small>{metric.note}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="dialog-note">
          业务数据按体验开始时间归属，状态取模拟数据截止时刻。设备状态独立按快照时刻判断。
        </p>
        <form method="dialog">
          <button className="button primary">我知道了</button>
        </form>
      </dialog>
    </div>
  );
}
