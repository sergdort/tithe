import { eq, inArray, and } from 'drizzle-orm';

import { reimbursementCategoryRules } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface ReimbursementCategoryRuleDto {
  id: string;
  expenseCategoryId: string;
  inboundCategoryId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const mapRule = (
  row: typeof reimbursementCategoryRules.$inferSelect,
): ReimbursementCategoryRuleDto => ({
  id: row.id,
  expenseCategoryId: row.expenseCategoryId,
  inboundCategoryId: row.inboundCategoryId,
  enabled: row.enabled,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export interface ListReimbursementCategoryRulesInput {
  expenseCategoryId?: string;
  inboundCategoryId?: string;
  enabledOnly?: boolean;
}

export interface ListReimbursementCategoryRulesOutput {
  rules: ReimbursementCategoryRuleDto[];
}

export interface FindReimbursementCategoryRuleByIdInput {
  id: string;
}

export interface FindReimbursementCategoryRuleByIdOutput {
  rule: ReimbursementCategoryRuleDto | null;
}

export interface FindReimbursementCategoryRuleByPairInput {
  expenseCategoryId: string;
  inboundCategoryId: string;
}

export interface FindReimbursementCategoryRuleByPairOutput {
  rule: ReimbursementCategoryRuleDto | null;
}

export interface CreateReimbursementCategoryRuleInput {
  id: string;
  expenseCategoryId: string;
  inboundCategoryId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReimbursementCategoryRuleOutput {
  rule: ReimbursementCategoryRuleDto;
}

export interface UpdateReimbursementCategoryRuleInput {
  id: string;
  enabled: boolean;
  updatedAt: string;
}

export interface UpdateReimbursementCategoryRuleOutput {
  rule: ReimbursementCategoryRuleDto | null;
}

export interface DeleteReimbursementCategoryRuleInput {
  id: string;
}

export interface DeleteReimbursementCategoryRuleOutput {
  deleted: boolean;
}

export interface ListReimbursementCategoryRulesByExpenseCategoryIdsInput {
  expenseCategoryIds: string[];
  enabledOnly?: boolean;
}

export interface ListReimbursementCategoryRulesByExpenseCategoryIdsOutput {
  rules: ReimbursementCategoryRuleDto[];
}

export interface ReimbursementCategoryRulesRepository {
  list: (input: ListReimbursementCategoryRulesInput) => ListReimbursementCategoryRulesOutput;
  listByExpenseCategoryIds: (
    input: ListReimbursementCategoryRulesByExpenseCategoryIdsInput,
  ) => ListReimbursementCategoryRulesByExpenseCategoryIdsOutput;
  findById: (input: FindReimbursementCategoryRuleByIdInput) => FindReimbursementCategoryRuleByIdOutput;
  findByPair: (
    input: FindReimbursementCategoryRuleByPairInput,
  ) => FindReimbursementCategoryRuleByPairOutput;
  create: (input: CreateReimbursementCategoryRuleInput) => CreateReimbursementCategoryRuleOutput;
  update: (input: UpdateReimbursementCategoryRuleInput) => UpdateReimbursementCategoryRuleOutput;
  deleteById: (input: DeleteReimbursementCategoryRuleInput) => DeleteReimbursementCategoryRuleOutput;
}

export class SqliteReimbursementCategoryRulesRepository
  implements ReimbursementCategoryRulesRepository
{
  constructor(private readonly db: RepositoryDb) {}

  list({
    expenseCategoryId,
    inboundCategoryId,
    enabledOnly,
  }: ListReimbursementCategoryRulesInput): ListReimbursementCategoryRulesOutput {
    const filters = [];
    if (expenseCategoryId) {
      filters.push(eq(reimbursementCategoryRules.expenseCategoryId, expenseCategoryId));
    }
    if (inboundCategoryId) {
      filters.push(eq(reimbursementCategoryRules.inboundCategoryId, inboundCategoryId));
    }
    if (enabledOnly) {
      filters.push(eq(reimbursementCategoryRules.enabled, true));
    }
    const whereExpr = filters.length > 0 ? and(...filters) : undefined;
    const query = this.db
      .select()
      .from(reimbursementCategoryRules)
      .orderBy(reimbursementCategoryRules.expenseCategoryId, reimbursementCategoryRules.inboundCategoryId);
    const rows = whereExpr ? query.where(whereExpr).all() : query.all();
    return { rules: rows.map(mapRule) };
  }

  listByExpenseCategoryIds({
    expenseCategoryIds,
    enabledOnly,
  }: ListReimbursementCategoryRulesByExpenseCategoryIdsInput): ListReimbursementCategoryRulesByExpenseCategoryIdsOutput {
    if (expenseCategoryIds.length === 0) {
      return { rules: [] };
    }
    const filters = [inArray(reimbursementCategoryRules.expenseCategoryId, expenseCategoryIds)];
    if (enabledOnly) {
      filters.push(eq(reimbursementCategoryRules.enabled, true));
    }
    const rows = this.db
      .select()
      .from(reimbursementCategoryRules)
      .where(and(...filters))
      .all();
    return { rules: rows.map(mapRule) };
  }

  findById({ id }: FindReimbursementCategoryRuleByIdInput): FindReimbursementCategoryRuleByIdOutput {
    const row = this.db
      .select()
      .from(reimbursementCategoryRules)
      .where(eq(reimbursementCategoryRules.id, id))
      .get();
    return { rule: row ? mapRule(row) : null };
  }

  findByPair({
    expenseCategoryId,
    inboundCategoryId,
  }: FindReimbursementCategoryRuleByPairInput): FindReimbursementCategoryRuleByPairOutput {
    const row = this.db
      .select()
      .from(reimbursementCategoryRules)
      .where(
        and(
          eq(reimbursementCategoryRules.expenseCategoryId, expenseCategoryId),
          eq(reimbursementCategoryRules.inboundCategoryId, inboundCategoryId),
        ),
      )
      .get();
    return { rule: row ? mapRule(row) : null };
  }

  create(input: CreateReimbursementCategoryRuleInput): CreateReimbursementCategoryRuleOutput {
    this.db.insert(reimbursementCategoryRules).values(input).run();
    const created = this.db
      .select()
      .from(reimbursementCategoryRules)
      .where(eq(reimbursementCategoryRules.id, input.id))
      .get();
    if (!created) {
      throw new Error(`Failed to fetch created reimbursement category rule ${input.id}`);
    }
    return { rule: mapRule(created) };
  }

  update({ id, ...patch }: UpdateReimbursementCategoryRuleInput): UpdateReimbursementCategoryRuleOutput {
    this.db.update(reimbursementCategoryRules).set(patch).where(eq(reimbursementCategoryRules.id, id)).run();
    const updated = this.db
      .select()
      .from(reimbursementCategoryRules)
      .where(eq(reimbursementCategoryRules.id, id))
      .get();
    return { rule: updated ? mapRule(updated) : null };
  }

  deleteById({ id }: DeleteReimbursementCategoryRuleInput): DeleteReimbursementCategoryRuleOutput {
    this.db.delete(reimbursementCategoryRules).where(eq(reimbursementCategoryRules.id, id)).run();
    return { deleted: true };
  }
}
