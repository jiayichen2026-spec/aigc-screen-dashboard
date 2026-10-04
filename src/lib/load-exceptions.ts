import type { MetricDataset } from "../types/mock-data.ts";
import { createExceptionEngine } from "./exceptions.ts";

export async function loadExceptions(
  data: MetricDataset,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("/mock/scenarios.json", { signal });
  if (!response.ok)
    throw new Error(`异常案例读取失败（HTTP ${response.status}）`);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("异常案例未返回JSON数据");
  return createExceptionEngine(data, await response.json());
}
