import { eq, sql } from 'drizzle-orm';

import { categories, expenses, recurringCommitments } from '@tithe/db';

import type { RepositoryDb } from './shared.js';

export interface CategoryDto {
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string;
  color: string;
  isSystem: boolean;
  reimbursementMode: 'none' | 'optional' | 'always';
  defaultCounterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays: number | null;
  defaultMyShareMode: 'fixed' | 'percent' | null;
  defaultMyShareValue: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapCategory = (row: typeof categories.$inferSelect): CategoryDto => ({
  id: row.id,
  name: row.name,
  kind: row.kind as 'expense' | 'income' | 'transfer',
  icon: row.icon,
  color: row.color,
  isSystem: row.isSystem,
  reimbursementMode:
    row.reimbursementMode === 'optional' || row.reimbursementMode === 'always'
      ? row.reimbursementMode
      : 'none',
  defaultCounterpartyType:
    row.defaultCounterpartyType === 'self' ||
    row.defaultCounterpartyType === 'partner' ||
    row.defaultCounterpartyType === 'team' ||
    row.defaultCounterpartyType === 'other'
      ? row.defaultCounterpartyType
      : null,
  defaultRecoveryWindowDays: row.defaultRecoveryWindowDays ?? null,
  defaultMyShareMode:
    row.defaultMyShareMode === 'fixed' || row.defaultMyShareMode === 'percent'
      ? row.defaultMyShareMode
      : null,
  defaultMyShareValue: row.defaultMyShareValue ?? null,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export type ListCategoriesInput = Record<string, never>;

export interface ListCategoriesOutput {
  categories: CategoryDto[];
}

export interface FindCategoryByIdInput {
  id: string;
}

export interface FindCategoryByIdOutput {
  category: CategoryDto | null;
}

export interface CreateCategoryInput {
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string;
  color: string;
  isSystem: boolean;
  reimbursementMode: 'none' | 'optional' | 'always';
  defaultCounterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays: number | null;
  defaultMyShareMode: 'fixed' | 'percent' | null;
  defaultMyShareValue: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryOutput {
  category: CategoryDto;
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string;
  color: string;
  reimbursementMode: 'none' | 'optional' | 'always';
  defaultCounterpartyType: 'self' | 'partner' | 'team' | 'other' | null;
  defaultRecoveryWindowDays: number | null;
  defaultMyShareMode: 'fixed' | 'percent' | null;
  defaultMyShareValue: number | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface UpdateCategoryOutput {
  category: CategoryDto | null;
}

export interface DeleteCategoryInput {
  id: string;
}

export interface DeleteCategoryOutput {
  deleted: boolean;
}

export interface CountCategoryReferencesInput {
  categoryId: string;
}

export interface CountCategoryReferencesOutput {
  expenseCount: number;
  commitmentCount: number;
}

export interface ReassignCategoryReferencesInput {
  fromCategoryId: string;
  toCategoryId: string;
  updatedAt: string;
}

export interface ReassignCategoryReferencesOutput {
  reassigned: true;
}

export interface CategoriesRepository {
  list(input: ListCategoriesInput): ListCategoriesOutput;
  findById(input: FindCategoryByIdInput): FindCategoryByIdOutput;
  create(input: CreateCategoryInput): CreateCategoryOutput;
  update(input: UpdateCategoryInput): UpdateCategoryOutput;
  deleteById(input: DeleteCategoryInput): DeleteCategoryOutput;
  countReferences(input: CountCategoryReferencesInput): CountCategoryReferencesOutput;
  reassignReferences(input: ReassignCategoryReferencesInput): ReassignCategoryReferencesOutput;
}

export class SqliteCategoriesRepository implements CategoriesRepository {
  constructor(private readonly db: RepositoryDb) {}

  list(_input: ListCategoriesInput): ListCategoriesOutput {
    const rows = this.db.select().from(categories).orderBy(categories.name).all();
    return { categories: rows.map(mapCategory) };
  }

  findById({ id }: FindCategoryByIdInput): FindCategoryByIdOutput {
    const row = this.db.select().from(categories).where(eq(categories.id, id)).get();
    return { category: row ? mapCategory(row) : null };
  }

  create(input: CreateCategoryInput): CreateCategoryOutput {
    this.db.insert(categories).values(input).run();
    return { category: mapCategory(input) };
  }

  update({ id, ...patch }: UpdateCategoryInput): UpdateCategoryOutput {
    this.db.update(categories).set(patch).where(eq(categories.id, id)).run();

    const updated = this.db.select().from(categories).where(eq(categories.id, id)).get();
    return { category: updated ? mapCategory(updated) : null };
  }

  deleteById({ id }: DeleteCategoryInput): DeleteCategoryOutput {
    this.db.delete(categories).where(eq(categories.id, id)).run();
    return { deleted: true };
  }

  countReferences({ categoryId }: CountCategoryReferencesInput): CountCategoryReferencesOutput {
    const expenseRef = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(expenses)
      .where(eq(expenses.categoryId, categoryId))
      .get();

    const commitmentRef = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(recurringCommitments)
      .where(eq(recurringCommitments.categoryId, categoryId))
      .get();

    return {
      expenseCount: expenseRef?.count ?? 0,
      commitmentCount: commitmentRef?.count ?? 0,
    };
  }

  reassignReferences({
    fromCategoryId,
    toCategoryId,
    updatedAt,
  }: ReassignCategoryReferencesInput): ReassignCategoryReferencesOutput {
    this.db
      .update(expenses)
      .set({ categoryId: toCategoryId, updatedAt })
      .where(eq(expenses.categoryId, fromCategoryId))
      .run();

    this.db
      .update(recurringCommitments)
      .set({ categoryId: toCategoryId, updatedAt })
      .where(eq(recurringCommitments.categoryId, fromCategoryId))
      .run();

    return { reassigned: true };
  }
}
