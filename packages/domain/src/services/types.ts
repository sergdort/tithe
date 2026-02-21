import type { Envelope, QuerySpec } from '@tithe/contracts';

import type { CategoryDto } from '../repositories/categories.repository.js';
import type {
  CommitmentDto,
  CommitmentInstanceDto,
} from '../repositories/commitments.repository.js';
import type { ExpenseDto } from '../repositories/expenses.repository.js';
import type {
  CategoryBreakdownDto,
  CommitmentForecastDto,
  MonthlyTrendDto,
} from '../repositories/reports.repository.js';
import type {
  ActorContext,
  CreateCategoryInput,
  CreateCommitmentInput,
  CreateExpenseInput,
  ListExpensesInput,
  UpdateCategoryInput,
  UpdateCommitmentInput,
  UpdateExpenseInput,
} from '../types.js';

export interface DomainServiceOptions {
  dbPath?: string;
}

export interface ApprovalToken {
  operationId: string;
  action: string;
  hash: string;
  expiresAt: string;
}

export interface CategoriesService {
  list: () => Promise<CategoryDto[]>;
  create: (input: CreateCategoryInput, context?: ActorContext) => Promise<CategoryDto>;
  update: (id: string, input: UpdateCategoryInput, context?: ActorContext) => Promise<CategoryDto>;
  createDeleteApproval: (id: string, reassignCategoryId?: string) => Promise<ApprovalToken>;
  delete: (
    id: string,
    approveOperationId: string,
    reassignCategoryId?: string,
    context?: ActorContext,
  ) => Promise<void>;
}

export interface ExpensesService {
  list: (input?: ListExpensesInput) => Promise<ExpenseDto[]>;
  get: (id: string) => Promise<ExpenseDto>;
  create: (input: CreateExpenseInput, context?: ActorContext) => Promise<ExpenseDto>;
  update: (id: string, input: UpdateExpenseInput, context?: ActorContext) => Promise<ExpenseDto>;
  createDeleteApproval: (id: string) => Promise<ApprovalToken>;
  delete: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
}

export interface CommitmentsService {
  list: () => Promise<CommitmentDto[]>;
  create: (input: CreateCommitmentInput, context?: ActorContext) => Promise<CommitmentDto>;
  get: (id: string) => Promise<CommitmentDto>;
  update: (
    id: string,
    input: UpdateCommitmentInput,
    context?: ActorContext,
  ) => Promise<CommitmentDto>;
  createDeleteApproval: (id: string) => Promise<ApprovalToken>;
  delete: (id: string, approveOperationId: string, context?: ActorContext) => Promise<void>;
  runDueGeneration: (
    upTo?: string,
    context?: ActorContext,
  ) => Promise<{ upTo: string; created: number }>;
  listInstances: (
    status?: 'pending' | 'paid' | 'overdue' | 'skipped',
  ) => Promise<CommitmentInstanceDto[]>;
}

export interface ReportsService {
  monthlyTrends: (months?: number) => Promise<MonthlyTrendDto[]>;
  categoryBreakdown: (from?: string, to?: string) => Promise<CategoryBreakdownDto[]>;
  commitmentForecast: (days?: number) => Promise<CommitmentForecastDto[]>;
}

export interface QueryService {
  run: (specInput: QuerySpec) => Promise<Envelope<unknown[]>>;
}

export interface MonzoService {
  connectStart: () => Promise<{ status: string; message: string }>;
  callback: () => Promise<{ status: string; message: string }>;
  syncNow: () => Promise<{ status: string; message: string }>;
}

export interface DomainServices {
  categories: CategoriesService;
  expenses: ExpensesService;
  commitments: CommitmentsService;
  reports: ReportsService;
  query: QueryService;
  monzo: MonzoService;
}
