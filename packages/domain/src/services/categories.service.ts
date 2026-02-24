import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import type { CategoryDto } from '../repositories/categories.repository.js';
import { SqliteCategoriesRepository } from '../repositories/categories.repository.js';
import { type RepositoryDb, withTransaction } from '../repositories/shared.js';
import type { ActorContext, CreateCategoryInput, UpdateCategoryInput } from '../types.js';
import type { ApprovalToken } from './shared/approval-service.js';
import type { ApprovalService } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, toIso } from './shared/common.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

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

interface CategoryServiceDeps {
  runtime: DomainDbRuntime;
  approvals: ApprovalService;
  audit: AuditService;
}

export const createCategoriesService = ({
  runtime,
  approvals,
  audit,
}: CategoryServiceDeps): CategoriesService => {
  const categoriesRepo = (db: RepositoryDb = runtime.db) => new SqliteCategoriesRepository(db);

  return {
  async list() {
    return categoriesRepo().list({}).categories;
  },

  async create(input: CreateCategoryInput, context: ActorContext = DEFAULT_ACTOR) {
    const now = toIso(new Date());
    const payload = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      icon: input.icon ?? 'receipt_long',
      color: input.color ?? '#2E7D32',
      isSystem: false,
      reimbursementMode: input.reimbursementMode ?? 'none',
      defaultCounterpartyType: input.defaultCounterpartyType ?? null,
      defaultRecoveryWindowDays: input.defaultRecoveryWindowDays ?? null,
      defaultMyShareMode: input.defaultMyShareMode ?? null,
      defaultMyShareValue: input.defaultMyShareValue ?? null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    let category: CategoryDto;
    try {
      category = categoriesRepo().create(payload).category;
    } catch (error) {
      throw new AppError('CATEGORY_CREATE_FAILED', 'Could not create category', 409, {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    await audit.writeAudit('category.create', payload, context);
    return category;
  },

  async update(id: string, input: UpdateCategoryInput, context: ActorContext = DEFAULT_ACTOR) {
    const existing = categoriesRepo().findById({ id }).category;
    if (!existing) {
      throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
    }

    const nextPatch = {
      name: input.name?.trim() ?? existing.name,
      kind: input.kind ?? existing.kind,
      icon: input.icon ?? existing.icon,
      color: input.color ?? existing.color,
      reimbursementMode: input.reimbursementMode ?? existing.reimbursementMode,
      defaultCounterpartyType:
        input.defaultCounterpartyType === undefined
          ? existing.defaultCounterpartyType
          : input.defaultCounterpartyType,
      defaultRecoveryWindowDays:
        input.defaultRecoveryWindowDays === undefined
          ? existing.defaultRecoveryWindowDays
          : input.defaultRecoveryWindowDays,
      defaultMyShareMode:
        input.defaultMyShareMode === undefined
          ? existing.defaultMyShareMode
          : input.defaultMyShareMode,
      defaultMyShareValue:
        input.defaultMyShareValue === undefined
          ? existing.defaultMyShareValue
          : input.defaultMyShareValue,
      archivedAt:
        input.archivedAt === undefined
          ? existing.archivedAt
          : input.archivedAt === null
            ? null
            : assertDate(input.archivedAt, 'archivedAt'),
      updatedAt: toIso(new Date()),
    };

    const category = categoriesRepo().update({ id, ...nextPatch }).category;

    if (!category) {
      throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
    }

    await audit.writeAudit('category.update', { id, patch: nextPatch }, context);

    return category;
  },

  async createDeleteApproval(id: string, reassignCategoryId?: string) {
    return approvals.createApproval('category.delete', { id, reassignCategoryId });
  },

  async delete(
    id: string,
    approveOperationId: string,
    reassignCategoryId?: string,
    context: ActorContext = DEFAULT_ACTOR,
  ): Promise<void> {
    await approvals.consumeApproval('category.delete', approveOperationId, {
      id,
      reassignCategoryId,
    });

    const target = categoriesRepo().findById({ id }).category;
    if (!target) {
      throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
    }

    if (reassignCategoryId) {
      const replacement = categoriesRepo().findById({
        id: reassignCategoryId,
      }).category;

      if (!replacement) {
        throw new AppError(
          'CATEGORY_REASSIGN_TARGET_NOT_FOUND',
          'Reassign category does not exist',
          404,
          {
            reassignCategoryId,
          },
        );
      }

      withTransaction(runtime.db, (tx) => {
        const txCategoriesRepo = categoriesRepo(tx);
        txCategoriesRepo.reassignReferences({
          fromCategoryId: id,
          toCategoryId: reassignCategoryId,
          updatedAt: toIso(new Date()),
        });

        txCategoriesRepo.deleteById({ id });
      });
    } else {
      const refs = categoriesRepo().countReferences({ categoryId: id });

      if (refs.expenseCount > 0 || refs.commitmentCount > 0) {
        throw new AppError(
          'CATEGORY_IN_USE',
          'Category has linked expenses or commitments. Pass reassign category.',
          409,
          {
            expenseCount: refs.expenseCount,
            commitmentCount: refs.commitmentCount,
          },
        );
      }

      categoriesRepo().deleteById({ id });
    }

    await audit.writeAudit('category.delete', { id, reassignCategoryId }, context);
  },
};
};
