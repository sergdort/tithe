import { AppError } from '../errors.js';
import type {
  CategoryBreakdownDto,
  CommitmentForecastDto,
  MonthlyLedgerDto,
  MonthlyTrendDto,
} from '../repositories/reports.repository.js';
import { SqliteReportsRepository } from '../repositories/reports.repository.js';
import { assertDate } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

export interface ReportsService {
  monthlyTrends: (months?: number) => Promise<MonthlyTrendDto[]>;
  categoryBreakdown: (from?: string, to?: string) => Promise<CategoryBreakdownDto[]>;
  commitmentForecast: (days?: number) => Promise<CommitmentForecastDto[]>;
  monthlyLedger: (input: { from: string; to: string }) => Promise<MonthlyLedgerDto>;
}

interface ReportsServiceDeps {
  runtime: DomainDbRuntime;
}

export const createReportsService = ({ runtime }: ReportsServiceDeps): ReportsService => ({
  async monthlyTrends(months = 6) {
    return new SqliteReportsRepository(runtime.db).monthlyTrends({ months }).rows;
  },

  async categoryBreakdown(from?: string, to?: string) {
    const normalizedFrom = from ? assertDate(from, 'from') : undefined;
    const normalizedTo = to ? assertDate(to, 'to') : undefined;

    return new SqliteReportsRepository(runtime.db).categoryBreakdown({
      from: normalizedFrom,
      to: normalizedTo,
    }).rows;
  },

  async commitmentForecast(days = 30) {
    const now = new Date();
    const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    return new SqliteReportsRepository(runtime.db).commitmentForecast({
      from: now.toISOString(),
      to,
    }).rows;
  },

  async monthlyLedger(input: { from: string; to: string }) {
    const from = assertDate(input.from, 'from');
    const to = assertDate(input.to, 'to');

    if (new Date(from).getTime() >= new Date(to).getTime()) {
      throw new AppError('VALIDATION_ERROR', 'from must be before to', 400, { from, to });
    }

    return new SqliteReportsRepository(runtime.db).monthlyLedger({ from, to }).ledger;
  },
});
