import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

use([LineChart, GridComponent, SVGRenderer]);

export default function TrendChart() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const chart = init(container.current, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 24, right: 20, top: 24, bottom: 30 },
      xAxis: {
        type: "category",
        data: [],
        axisLine: { lineStyle: { color: "#dde6e0" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: "#edf1ee", type: "dashed" } },
      },
      series: [{ type: "line", data: [] }],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, []);

  return (
    <div className="chart-wrap">
      <div ref={container} className="chart" aria-hidden="true" />
      <div className="chart-empty">
        <span className="empty-symbol">↗</span>
        <strong>等待第一条体验记录</strong>
        <p>数据接入后，在这里查看参与趋势与生成表现</p>
      </div>
    </div>
  );
}
