import { useEffect, useMemo, useState } from "react";
import type { MetricDataset } from "../types/mock-data";
import type { MetricFilter } from "../lib/metrics";
import { loadExceptions } from "../lib/load-exceptions";

type Resource =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; engine: Awaited<ReturnType<typeof loadExceptions>> };
export function useExceptions(
  dataset: MetricDataset | null,
  filter: MetricFilter | null,
) {
  const [resource, setResource] = useState<Resource>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!dataset) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(
      () => controller.abort(new Error("异常案例加载超时，请重试")),
      15000,
    );
    loadExceptions(dataset, controller.signal)
      .then(
        (engine) => {
          if (active) setResource({ status: "ready", engine });
        },
        (error) => {
          if (active)
            setResource({
              status: "error",
              message:
                error instanceof Error ? error.message : "异常案例读取失败",
            });
        },
      )
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dataset, attempt]);
  const report = useMemo(
    () =>
      dataset && filter && resource.status === "ready"
        ? resource.engine.evaluate(filter)
        : null,
    [dataset, filter, resource],
  );
  return {
    resource,
    report,
    retry: () => {
      setResource({ status: "loading" });
      setAttempt((n) => n + 1);
    },
  };
}
