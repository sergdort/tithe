import crypto from 'node:crypto';

import { AppError } from '../errors.js';
import { withTransaction } from '../repositories/shared.js';
import type { ActorContext, CreateCategoryInput, UpdateCategoryInput } from '../types.js';
import type { ApprovalService } from './shared/approval-service.js';
import type { AuditService } from './shared/audit-service.js';
import { DEFAULT_ACTOR, assertDate, toIso } from './shared/common.js';
import type { DomainRuntimeDeps } from './shared/deps.js';
import type { CategoriesService } from './types.js';

interface CategoryServiceDeps {
  runtime: DomainRuntimeDeps;
  approvals: ApprovalService;
  audit: AuditService;
}

export const createCategoriesService = ({
  runtime,
  approvals,
  audit,
}: CategoryServiceDeps): CategoriesService => ({
  async list() {
    return runtime.withDb(({ db }) => runtime.repositories.categories(db).list({}).categories);
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
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const category = await runtime.withDb(({ db }) => {
      try {
        return runtime.repositories.categories(db).create(payload).category;
      } catch (error) {
        throw new AppError('CATEGORY_CREATE_FAILED', 'Could not create category', 409, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await audit.writeAudit('category.create', payload, context);
    return category;
  },

  async update(id: string, input: UpdateCategoryInput, context: ActorContext = DEFAULT_ACTOR) {
    const { category, patch } = await runtime.withDb(({ db }) => {
      const existing = runtime.repositories.categories(db).findById({ id }).category;
      if (!existing) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      const nextPatch = {
        name: input.name?.trim() ?? existing.name,
        kind: input.kind ?? existing.kind,
        icon: input.icon ?? existing.icon,
        color: input.color ?? existing.color,
        archivedAt:
          input.archivedAt === undefined
            ? existing.archivedAt
            : input.archivedAt === null
              ? null
              : assertDate(input.archivedAt, 'archivedAt'),
        updatedAt: toIso(new Date()),
      };

      const updated = runtime.repositories.categories(db).update({ id, ...nextPatch }).category;

      if (!updated) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      return {
        category: updated,
        patch: nextPatch,
      };
    });

    await audit.writeAudit('category.update', { id, patch }, context);

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

    await runtime.withDb(({ db }) => {
      const target = runtime.repositories.categories(db).findById({ id }).category;
      if (!target) {
        throw new AppError('CATEGORY_NOT_FOUND', `Category ${id} does not exist`, 404);
      }

      if (reassignCategoryId) {
        const replacement = runtime.repositories.categories(db).findById({
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

        withTransaction(db, (tx) => {
          runtime.repositories.categories(tx).reassignReferences({
            fromCategoryId: id,
            toCategoryId: reassignCategoryId,
            updatedAt: toIso(new Date()),
          });

          runtime.repositories.categories(tx).deleteById({ id });
        });
      } else {
        const refs = runtime.repositories.categories(db).countReferences({ categoryId: id });

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

        runtime.repositories.categories(db).deleteById({ id });
      }
    });

    await audit.writeAudit('category.delete', { id, reassignCategoryId }, context);
  },
});
