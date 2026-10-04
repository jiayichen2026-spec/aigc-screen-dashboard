import { useEffect, useState } from "react";
import { loadDashboard } from "../lib/load-dashboard";
import type { DashboardData } from "../lib/load-dashboard";

type Resource =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

export function useDashboardData() {
  const [resource, setResource] = useState<Resource>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(new Error("数据加载超时，请重试")),
      15000,
    );
    let active = true;
    loadDashboard(controller.signal)
      .then(
        (data) => {
          if (active) setResource({ status: "ready", data });
        },
        (error: unknown) => {
          if (active)
            setResource({
              status: "error",
              message:
                error instanceof Error ? error.message : "无法读取模拟数据",
            });
        },
      )
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  const retry = () => {
    setResource({ status: "loading" });
    setAttempt((value) => value + 1);
  };
  return { resource, retry };
}
