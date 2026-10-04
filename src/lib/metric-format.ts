import { MetricInputError } from "./metrics.ts";

const EMPTY = "—";

function numeric(value: number | null, digits: number): string {
  if (value === null) return EMPTY;
  if (!Number.isFinite(value) || value < 0)
    throw new MetricInputError("显示值必须为非负有限数字或null");
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Returns only the value; the existing card separately renders its unit. */
export function formatCount(value: number | null): string {
  if (value !== null && !Number.isInteger(value))
    throw new MetricInputError("计数不能是小数");
  return numeric(value, 0);
}

/** Input is a raw 0..1 ratio; output excludes the percent sign. */
export function formatPercent(value: number | null): string {
  if (value !== null && (value < 0 || value > 1))
    throw new MetricInputError("比例须在0至1之间");
  return numeric(value === null ? null : value * 100, 2);
}

export function formatSeconds(value: number | null): string {
  return numeric(value, 2);
}
