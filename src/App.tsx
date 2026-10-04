import { useRef, useState } from "react";
import Icon from "./components/Icon";
import TrendChart from "./components/TrendChart";
import { locations, metricDefinitions } from "./data/catalog";

const navigation = [
  { id: "overview", label: "运营概览", icon: "overview" },
  { id: "moderation", label: "内容审核", icon: "shield" },
  { id: "devices", label: "设备状态", icon: "screen" },
  { id: "exceptions", label: "异常中心", icon: "alert" },
] as const;

export default function App() {
  const [location, setLocation] = useState("all");
  const [period, setPeriod] = useState("7");
  const [activeSection, setActiveSection] = useState("overview");
  const definitions = useRef<HTMLDialogElement>(null);
  const locationName = locations.find((item) => item.id === location)!.name;

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
            基础原型 <span>v0.1</span>
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
        <main id="main">
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
            <div className="notice">
              <span className="notice-icon">
                <Icon name="info" />
              </span>
              <div>
                <strong>基础页面已就绪，模拟数据待接入</strong>
                <p>
                  当前数值“—”表示暂无数据，不代表业务表现为零。点位名称为虚构演示配置。
                </p>
              </div>
              <span className="notice-tag">初始化版本</span>
            </div>
            <div className="filter-bar">
              <div className="filters">
                <label>
                  统计周期
                  <select
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                  >
                    <option value="7">最近 7 天</option>
                    <option value="30">最近 30 天</option>
                  </select>
                </label>
                <label>
                  活动点位
                  <select
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  >
                    {locations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="reset"
                  onClick={() => {
                    setLocation("all");
                    setPeriod("7");
                  }}
                >
                  重置
                </button>
              </div>
              <span className="timezone">北京时间 · UTC+8</span>
            </div>
            <p className="filter-summary" aria-live="polite">
              <Icon name="location" />
              {locationName}
              <span>·</span>最近 {period} 天<span>·</span>
              日期范围将在数据接入后确定
            </p>
            <div className="metrics">
              {metricDefinitions.slice(0, 4).map((metric, index) => (
                <article className="metric-card" key={metric.name}>
                  <div className="metric-label">
                    {metric.name}
                    <span className="metric-index">0{index + 1}</span>
                  </div>
                  <div className="metric-value">
                    —<span>{["人", "%", "%", "秒"][index]}</span>
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
                  <span className="metric-status">数据待接入</span>
                </article>
              ))}
            </div>
            <div className="analytics-grid">
              <section className="panel trend-panel">
                <div className="panel-heading">
                  <div>
                    <h2>活动趋势</h2>
                    <p>观察参与规模与生成服务的变化</p>
                  </div>
                  <span className="legend">
                    <i />
                    参与人数
                  </span>
                </div>
                <TrendChart />
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
                  {locations
                    .filter(
                      (item) =>
                        item.id !== "all" &&
                        (location === "all" || location === item.id),
                    )
                    .map((item, index) => (
                      <div className="location-row" key={item.id}>
                        <span className="location-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <span>暂无体验记录</span>
                        </div>
                        <span className="location-value">—</span>
                      </div>
                    ))}
                </div>
                <div className="panel-footnote">
                  点位比较将使用相同的统计口径
                </div>
              </section>
            </div>
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
                    <strong>—</strong>
                  </div>
                ))}
              </div>
              <p className="panel-footnote">暂无审核记录 · 审核通过率 —</p>
            </section>
            <section id="devices" className="panel">
              <div className="panel-heading">
                <div>
                  <h2>设备状态</h2>
                  <p>仅跟随点位筛选 · 快照时间待接入</p>
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
                    <strong>—</strong>
                  </div>
                ))}
              </div>
              <p className="panel-footnote">
                暂无设备快照 · 当前点位：{locationName}
              </p>
            </section>
          </div>
          <section id="exceptions" className="panel exceptions">
            <div className="panel-heading">
              <div>
                <h2>异常中心</h2>
                <p>聚合生成、内容与设备异常，帮助确定排查顺序</p>
              </div>
              <span className="neutral-badge">待接入异常记录</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "发生时间",
                      "活动点位",
                      "异常类型",
                      "影响范围",
                      "详情",
                    ].map((text) => (
                      <th key={text} scope="col">
                        {text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <Icon name="activity" />
                        <strong>暂无可展示的异常记录</strong>
                        <span>
                          模拟数据接入后，将支持查看异常现象和排查建议。
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <footer className="footer">
            <span>ScreenPulse · AIGC 互动大屏运营看板</span>
            <span>模拟演示 / 基础原型 v0.1</span>
          </footer>
        </main>
      </div>
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
          当前为拟定口径；数值待模拟数据接入后计算。分母为零时显示“—”。
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
