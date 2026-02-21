import type { QuerySpec } from '@tithe/contracts';
import type { createDb } from '@tithe/db';

export interface RunEntityQueryInput {
  spec: QuerySpec;
}

export interface RunEntityQueryOutput {
  rows: unknown[];
  entity: QuerySpec['entity'];
  count: number;
}

interface EntityConfig {
  table: string;
  allowedFields: Set<string>;
  defaultSort: string;
}

const ENTITY_CONFIG: Record<QuerySpec['entity'], EntityConfig> = {
  expenses: {
    table: 'expenses',
    allowedFields: new Set([
      'id',
      'occurred_at',
      'posted_at',
      'amount_minor',
      'currency',
      'category_id',
      'source',
      'merchant_name',
      'note',
      'created_at',
      'updated_at',
    ]),
    defaultSort: 'created_at',
  },
  categories: {
    table: 'categories',
    allowedFields: new Set([
      'id',
      'name',
      'kind',
      'icon',
      'color',
      'is_system',
      'archived_at',
      'created_at',
      'updated_at',
    ]),
    defaultSort: 'name',
  },
  commitment_instances: {
    table: 'commitment_instances',
    allowedFields: new Set([
      'id',
      'commitment_id',
      'due_at',
      'expected_amount_minor',
      'currency',
      'status',
      'expense_id',
      'resolved_at',
      'created_at',
    ]),
    defaultSort: 'due_at',
  },
  recurring_commitments: {
    table: 'recurring_commitments',
    allowedFields: new Set([
      'id',
      'name',
      'rrule',
      'start_date',
      'default_amount_minor',
      'currency',
      'category_id',
      'grace_days',
      'active',
      'next_due_at',
      'created_at',
      'updated_at',
    ]),
    defaultSort: 'name',
  },
};

export interface QueryRepository {
  runEntityQuery(input: RunEntityQueryInput): RunEntityQueryOutput;
  isAllowedField(entity: QuerySpec['entity'], field: string): boolean;
  getDefaultSort(entity: QuerySpec['entity']): string;
}

export class SqliteQueryRepository implements QueryRepository {
  constructor(private readonly sqlite: ReturnType<typeof createDb>['sqlite']) {}

  isAllowedField(entity: QuerySpec['entity'], field: string): boolean {
    return ENTITY_CONFIG[entity].allowedFields.has(field);
  }

  getDefaultSort(entity: QuerySpec['entity']): string {
    return ENTITY_CONFIG[entity].defaultSort;
  }

  runEntityQuery({ spec }: RunEntityQueryInput): RunEntityQueryOutput {
    const config = ENTITY_CONFIG[spec.entity];

    const params: Array<string | number | boolean> = [];
    const whereParts: string[] = [];

    for (const filter of spec.filters) {
      switch (filter.op) {
        case 'eq':
        case 'neq':
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          const sqlOp = {
            eq: '=',
            neq: '!=',
            gt: '>',
            gte: '>=',
            lt: '<',
            lte: '<=',
          }[filter.op];
          whereParts.push(`${filter.field} ${sqlOp} ?`);
          params.push(filter.value as string | number | boolean);
          break;
        }
        case 'like':
          whereParts.push(`${filter.field} LIKE ?`);
          params.push(filter.value as string);
          break;
        case 'in': {
          const values = filter.value as Array<string | number>;
          const placeholders = values.map(() => '?').join(',');
          whereParts.push(`${filter.field} IN (${placeholders})`);
          params.push(...values);
          break;
        }
      }
    }

    const sortBy = config.allowedFields.has(spec.sortBy) ? spec.sortBy : config.defaultSort;
    const sortDir = spec.sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const query = `SELECT * FROM ${config.table} ${whereClause} ORDER BY ${sortBy} ${sortDir} LIMIT ?`;
    params.push(spec.limit);

    const rows = this.sqlite.prepare(query).all(...params);

    return {
      rows,
      entity: spec.entity,
      count: rows.length,
    };
  }
}
