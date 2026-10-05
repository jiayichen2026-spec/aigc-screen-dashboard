export const navigationGroups = [
  {
    label: "运营分析",
    items: [
      { id: "overview", label: "概览与筛选", icon: "overview" },
      { id: "focus", label: "重点关注", icon: "alert" },
      { id: "performance", label: "趋势与点位", icon: "activity" },
      { id: "funnel", label: "转化漏斗", icon: "funnel" },
    ],
  },
  {
    label: "服务与排查",
    items: [
      { id: "moderation", label: "内容审核", icon: "shield" },
      { id: "devices", label: "设备状态", icon: "screen" },
      { id: "exceptions", label: "异常中心", icon: "search" },
    ],
  },
] as const;

export const navigationItems = navigationGroups.flatMap((group) => [
  ...group.items,
]);
export type SectionId = (typeof navigationItems)[number]["id"];

export function isSectionId(id: string): id is SectionId {
  return navigationItems.some((item) => item.id === id);
}

// Sections sharing a desktop row retain the selected member of that row.
export function sectionAtPosition(
  sections: { id: SectionId; top: number }[],
  activationLine: number,
  current: SectionId,
  atBottom: boolean,
): SectionId {
  if (!sections.length) return "overview";
  if (atBottom) return sections[sections.length - 1].id;
  const passed = sections.filter((section) => section.top <= activationLine);
  if (!passed.length) return sections[0].id;
  const top = Math.max(...passed.map((section) => section.top));
  const row = passed.filter((section) => Math.abs(section.top - top) < 2);
  return row.find((section) => section.id === current)?.id ?? row[0].id;
}
