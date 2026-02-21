import { createCategoriesService } from './categories.service.js';
import { createCommitmentsService } from './commitments.service.js';
import { createExpensesService } from './expenses.service.js';
import { createMonzoService } from './monzo.service.js';
import { createQueryService } from './query.service.js';
import { createReportsService } from './reports.service.js';
import { createApprovalService } from './shared/approval-service.js';
import { createAuditService } from './shared/audit-service.js';
import { createDomainRuntimeDeps } from './shared/deps.js';
import type { DomainServiceOptions, DomainServices } from './types.js';

export const createDomainServices = (options: DomainServiceOptions = {}): DomainServices => {
  const runtime = createDomainRuntimeDeps(options);
  const approvals = createApprovalService(runtime);
  const audit = createAuditService(runtime);

  return {
    categories: createCategoriesService({ runtime, approvals, audit }),
    expenses: createExpensesService({ runtime, approvals, audit }),
    commitments: createCommitmentsService({ runtime, approvals, audit }),
    reports: createReportsService({ runtime }),
    query: createQueryService({ runtime }),
    monzo: createMonzoService(),
  };
};
