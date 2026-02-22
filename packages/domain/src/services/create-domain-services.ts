import { createCategoriesService } from './categories.service.js';
import type { CategoriesService } from './categories.service.js';
import { createCommitmentsService } from './commitments.service.js';
import type { CommitmentsService } from './commitments.service.js';
import { createExpensesService } from './expenses.service.js';
import type { ExpensesService } from './expenses.service.js';
import { createMonzoService } from './monzo.service.js';
import type { MonzoService } from './monzo.service.js';
import { createQueryService } from './query.service.js';
import type { QueryService } from './query.service.js';
import { createReportsService } from './reports.service.js';
import type { ReportsService } from './reports.service.js';
import { createApprovalService } from './shared/approval-service.js';
import { createAuditService } from './shared/audit-service.js';
import { createDomainDbRuntime } from './shared/domain-db.js';
import type { DomainServiceOptions } from './shared/domain-db.js';

export interface DomainServices {
  categories: CategoriesService;
  expenses: ExpensesService;
  commitments: CommitmentsService;
  reports: ReportsService;
  query: QueryService;
  monzo: MonzoService;
}

export interface ClosableDomainServices extends DomainServices {
  close: () => void;
}

export const createDomainServices = (
  options: DomainServiceOptions = {},
): ClosableDomainServices => {
  const runtime = createDomainDbRuntime(options);
  const approvals = createApprovalService(runtime);
  const audit = createAuditService(runtime);
  const services: ClosableDomainServices = {
    categories: createCategoriesService({ runtime, approvals, audit }),
    expenses: createExpensesService({ runtime, approvals, audit }),
    commitments: createCommitmentsService({ runtime, approvals, audit }),
    reports: createReportsService({ runtime }),
    query: createQueryService({ runtime }),
    monzo: createMonzoService({ runtime, audit }),
    close: () => runtime.close(),
  };

  return services;
};
