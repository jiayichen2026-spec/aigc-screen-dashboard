import type { Generation, Session } from "../types/mock-data.ts";

export const funnelStages = [
  { id: "started", label: "开始体验" },
  { id: "submitted", label: "提交生成" },
  { id: "succeeded", label: "生成成功" },
  { id: "approved", label: "审核通过" },
  { id: "displayed", label: "结果展示" },
  { id: "scanned", label: "扫码领取" },
] as const;

export interface FunnelStage {
  id: (typeof funnelStages)[number]["id"];
  label: string;
  count: number;
  sessionIds: string[];
  previousCount: number | null;
  conversionRate: number | null;
  difference: number | null;
  breakdown: { label: string; count: number; sessionIds: string[] }[];
}

/** Called after the metric engine validates the snapshot, timestamps and one-job-per-session contract. */
export function calculateFunnel(
  sessions: Session[],
  jobs: Map<string, Generation>,
): FunnelStage[] {
  const cohorts = funnelStages.map(() => new Set<string>());
  for (const session of sessions) {
    const job = jobs.get(session.session_id);
    const reached = [
      true,
      job !== undefined,
      job?.status === "success",
      job?.moderation_status === "passed",
      job?.result_displayed_at != null,
      (job?.scan_events.length ?? 0) > 0,
    ];
    reached.forEach((complete, index) => {
      if (complete && index > 0 && !reached[index - 1]) {
        throw new Error(
          `漏斗关系不一致：${session.session_id} 的${funnelStages[index].label}缺少前序阶段`,
        );
      }
      if (complete) cohorts[index].add(session.session_id);
    });
  }
  return funnelStages.map((stage, index) => {
    const current = cohorts[index];
    const previous = index > 0 ? cohorts[index - 1] : null;
    const groups = new Map<string, string[]>(
      (index === 1
        ? ["未提交生成（原因未知）"]
        : index === 2
          ? ["生成失败", "排队中", "处理中"]
          : index === 3
            ? ["审核拦截", "待审核"]
            : index === 4
              ? ["已通过但尚未展示（原因未知）"]
              : index === 5
                ? ["已展示但尚未扫码（原因未知）"]
                : []
      ).map((label) => [label, []]),
    );
    for (const id of previous ?? []) {
      if (current.has(id)) continue;
      const job = jobs.get(id);
      const label =
        index === 2
          ? (
              {
                failed: "生成失败",
                queued: "排队中",
                processing: "处理中",
              } as Record<string, string>
            )[job?.status ?? ""]
          : index === 3
            ? (
                { blocked: "审核拦截", pending: "待审核" } as Record<
                  string,
                  string
                >
              )[job?.moderation_status ?? ""]
            : groups.keys().next().value;
      // Never hide an unclassified record or force a decreasing count by clamping.
      if (!label || !groups.has(label))
        throw new Error(`漏斗差额无法核对：${id}`);
      groups.get(label)!.push(id);
    }
    return {
      ...stage,
      count: current.size,
      sessionIds: [...current],
      previousCount: previous?.size ?? null,
      conversionRate: previous?.size ? current.size / previous.size : null,
      difference: previous ? previous.size - current.size : null,
      breakdown: [...groups].map(([label, ids]) => ({
        label,
        count: ids.length,
        sessionIds: ids,
      })),
    };
  });
}
