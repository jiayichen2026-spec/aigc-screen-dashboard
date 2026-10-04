import { createMetricEngine } from "./metrics.ts";
import type { MetricDataset } from "../types/mock-data.ts";

export async function loadDashboard(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const names = ["metadata", "sessions", "generations", "devices"] as const;
  const values = await Promise.all(
    names.map(async (name) => {
      const response = await fetcher(`/mock/${name}.json`, { signal });
      if (!response.ok)
        throw new Error(`读取 ${name}.json 失败（HTTP ${response.status}）`);
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(`${name}.json 未返回 JSON 数据`);
      }
      return response.json();
    }),
  );
  const [metadata, sessions, generations, devices] = values;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !Array.isArray(sessions) ||
    !Array.isArray(generations) ||
    !Array.isArray(devices)
  ) {
    throw new Error("模拟数据文件结构不正确");
  }
  const dataset: MetricDataset = { metadata, sessions, generations, devices };
  // Validate relationships and metric invariants before rendering any result.
  return {
    metadata: dataset.metadata,
    engine: createMetricEngine(dataset),
    dataset,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
