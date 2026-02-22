import {
  type ApprovalsRepository,
  SqliteApprovalsRepository,
} from '../../repositories/approvals.repository.js';
import {
  type AuditRepository,
  SqliteAuditRepository,
} from '../../repositories/audit.repository.js';
import {
  type CategoriesRepository,
  SqliteCategoriesRepository,
} from '../../repositories/categories.repository.js';
import {
  type CommitmentsRepository,
  SqliteCommitmentsRepository,
} from '../../repositories/commitments.repository.js';
import {
  type ExpensesRepository,
  SqliteExpensesRepository,
} from '../../repositories/expenses.repository.js';
import {
  type MonzoRepository,
  SqliteMonzoRepository,
} from '../../repositories/monzo.repository.js';
import {
  type QueryRepository,
  SqliteQueryRepository,
} from '../../repositories/query.repository.js';
import {
  type ReportsRepository,
  SqliteReportsRepository,
} from '../../repositories/reports.repository.js';
import { type RepositoryDb, type SessionContext, withSession } from '../../repositories/shared.js';

export interface DomainServiceOptions {
  dbPath?: string;
}

export interface RepositoryFactories {
  categories: (db: RepositoryDb) => CategoriesRepository;
  expenses: (db: RepositoryDb) => ExpensesRepository;
  commitments: (db: RepositoryDb) => CommitmentsRepository;
  reports: (db: RepositoryDb) => ReportsRepository;
  monzo: (db: RepositoryDb) => MonzoRepository;
  query: (sqlite: SessionContext['sqlite']) => QueryRepository;
  approvals: (db: RepositoryDb) => ApprovalsRepository;
  audit: (db: RepositoryDb) => AuditRepository;
}

export interface DomainRuntimeDeps {
  withDb: <T>(run: (ctx: SessionContext) => Promise<T> | T) => Promise<T>;
  repositories: RepositoryFactories;
}

export const createDomainRuntimeDeps = (options: DomainServiceOptions = {}): DomainRuntimeDeps => ({
  withDb: <T>(run: (ctx: SessionContext) => Promise<T> | T) => withSession(options, run),
  repositories: {
    categories: (db) => new SqliteCategoriesRepository(db),
    expenses: (db) => new SqliteExpensesRepository(db),
    commitments: (db) => new SqliteCommitmentsRepository(db),
    reports: (db) => new SqliteReportsRepository(db),
    monzo: (db) => new SqliteMonzoRepository(db),
    query: (sqlite) => new SqliteQueryRepository(sqlite),
    approvals: (db) => new SqliteApprovalsRepository(db),
    audit: (db) => new SqliteAuditRepository(db),
  },
});
