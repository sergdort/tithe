import { assertDate } from './shared/common.js';
import type { DomainRuntimeDeps } from './shared/deps.js';
import type { ReportsService } from './types.js';

interface ReportsServiceDeps {
  runtime: DomainRuntimeDeps;
}

export const createReportsService = ({ runtime }: ReportsServiceDeps): ReportsService => ({
  async monthlyTrends(months = 6) {
    return runtime.withDb(
      ({ db }) => runtime.repositories.reports(db).monthlyTrends({ months }).rows,
    );
  },

  async categoryBreakdown(from?: string, to?: string) {
    return runtime.withDb(({ db }) => {
      const normalizedFrom = from ? assertDate(from, 'from') : undefined;
      const normalizedTo = to ? assertDate(to, 'to') : undefined;

      return runtime.repositories.reports(db).categoryBreakdown({
        from: normalizedFrom,
        to: normalizedTo,
      }).rows;
    });
  },

  async commitmentForecast(days = 30) {
    const now = new Date();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    return runtime.withDb(
      ({ db }) =>
        runtime.repositories.reports(db).commitmentForecast({
          from: now.toISOString(),
          to,
        }).rows,
    );
  },
});
