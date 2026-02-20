import type { TrendPoint } from '@tithe/contracts';

export interface TrendSummary {
  latestMonth: string | null;
  latestSpendMinor: number;
  previousSpendMinor: number;
  deltaMinor: number;
  deltaPct: number;
}

export const summarizeTrend = (points: TrendPoint[]): TrendSummary => {
  if (points.length === 0) {
    return {
      latestMonth: null,
      latestSpendMinor: 0,
      previousSpendMinor: 0,
      deltaMinor: 0,
      deltaPct: 0,
    };
  }

  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  const latestSpend = latest?.spendBaseMinor ?? 0;
  const previousSpend = previous?.spendBaseMinor ?? 0;
  const delta = latestSpend - previousSpend;
  const deltaPct = previousSpend === 0 ? 0 : (delta / previousSpend) * 100;

  return {
    latestMonth: latest.month,
    latestSpendMinor: latestSpend,
    previousSpendMinor: previousSpend,
    deltaMinor: delta,
    deltaPct,
  };
};
