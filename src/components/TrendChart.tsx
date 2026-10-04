import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import type { EChartsType } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { DashboardCalculation } from "../lib/metrics";
import { formatCount, formatPercent } from "../lib/metric-format";

use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

export default function TrendChart({
  result,
  unavailableText,
}: {
  result: DashboardCalculation | null;
  unavailableText: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const chart = init(container.current, undefined, { renderer: "svg" });
    instance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const days = result?.daily ?? [];
    instance.current?.setOption(
      {
        animation: false,
        grid: { left: 48, right: 54, top: 30, bottom: 36 },
        tooltip: { trigger: "axis", confine: true, renderMode: "richText" },
        xAxis: {
          type: "category",
          data: days.map(
            (day) =>
              `${day.date.slice(5)}${day.coverage === "partial" ? "*" : day.coverage === "unavailable" ? "†" : ""}`,
          ),
          axisLine: { lineStyle: { color: "#b1c3b8" } },
          axisTick: { show: false },
          axisLabel: { fontSize: 10, color: "#698171", hideOverlap: true },
        },
        yAxis: [
          {
            type: "value",
            name: "人",
            min: 0,
            minInterval: 1,
            nameTextStyle: { color: "#698171" },
            axisLabel: { fontSize: 10, color: "#698171" },
            splitLine: { lineStyle: { color: "#edf1ee", type: "dashed" } },
          },
          {
            type: "value",
            name: "%",
            min: 0,
            max: 100,
            nameTextStyle: { color: "#ad8455" },
            axisLabel: { fontSize: 10, color: "#ad8455" },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: "参与人数",
            type: "line",
            data: days.map((day) => day.metrics?.participants ?? null),
            connectNulls: false,
            symbolSize: 5,
            itemStyle: { color: "#20785a" },
            lineStyle: { width: 2 },
            areaStyle: { color: "#dbeee2", opacity: 0.45 },
          },
          {
            name: "生成成功率（%）",
            type: "line",
            yAxisIndex: 1,
            data: days.map((day) =>
              day.metrics?.generation.successRate == null
                ? null
                : Number((day.metrics.generation.successRate * 100).toFixed(2)),
            ),
            connectNulls: false,
            symbolSize: 4,
            itemStyle: { color: "#b18a58" },
            lineStyle: { width: 2, type: "dashed" },
          },
        ],
      },
      { notMerge: true },
    );
  }, [result]);

  const emptyText = !result
    ? unavailableText
    : !result.metrics
      ? "所选日期没有数据覆盖"
      : !result.metrics.sessions
        ? "所选范围暂无体验记录"
        : null;
  return (
    <>
      <div className="chart-wrap">
        <div ref={container} className="chart" aria-hidden="true" />
        {emptyText && (
          <div className="chart-empty">
            <span className="empty-symbol">↗</span>
            <strong>{emptyText}</strong>
            <p>缺失值显示为“—”，不作为0计算</p>
          </div>
        )}
      </div>
      {result && (
        <>
          <p className="panel-footnote">
            * 当天尚未结束；† 日期未覆盖。两条曲线分别使用人数与百分比坐标。
          </p>
          <details className="trend-details">
            <summary>查看每日明细（{result.daily.length}天）</summary>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  与趋势图相同的每日计算结果
                </caption>
                <thead>
                  <tr>
                    <th scope="col">日期</th>
                    <th scope="col">参与人数</th>
                    <th scope="col">生成成功率</th>
                    <th scope="col">数据覆盖</th>
                  </tr>
                </thead>
                <tbody>
                  {result.daily.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{formatCount(day.metrics?.participants ?? null)}</td>
                      <td>
                        {formatPercent(
                          day.metrics?.generation.successRate ?? null,
                        )}
                        %
                      </td>
                      <td>
                        {
                          {
                            complete: "完整",
                            partial: "截至快照",
                            unavailable: "未覆盖",
                          }[day.coverage]
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}
