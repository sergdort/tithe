import { type Envelope, type QuerySpec, fail, ok, querySpecSchema } from '@tithe/contracts';

import { SqliteQueryRepository } from '../repositories/query.repository.js';
import type { DomainDbRuntime } from './shared/domain-db.js';

export interface QueryService {
  run: (specInput: QuerySpec) => Promise<Envelope<unknown[]>>;
}

interface QueryServiceDeps {
  runtime: DomainDbRuntime;
}

export const createQueryService = ({ runtime }: QueryServiceDeps): QueryService => ({
  async run(specInput: QuerySpec) {
    const parsed = querySpecSchema.safeParse(specInput);
    if (!parsed.success) {
      return fail('INVALID_QUERY_SPEC', 'Query specification is invalid', {
        issues: parsed.error.issues,
      });
    }

    const spec = parsed.data;

    const queryRepository = new SqliteQueryRepository(runtime.sqlite);

    for (const filter of spec.filters) {
      if (!queryRepository.isAllowedField(spec.entity, filter.field)) {
        return fail('INVALID_FILTER_FIELD', 'Filter contains unsupported field', {
          field: filter.field,
          entity: spec.entity,
        });
      }
    }

    const sortBy = queryRepository.isAllowedField(spec.entity, spec.sortBy)
      ? spec.sortBy
      : queryRepository.getDefaultSort(spec.entity);

    const result = queryRepository.runEntityQuery({
      spec: {
        ...spec,
        sortBy,
      },
    });

    return ok(result.rows, { entity: result.entity, count: result.count });
  },
});
