import { type QuerySpec, fail, ok, querySpecSchema } from '@tithe/contracts';

import type { DomainRuntimeDeps } from './shared/deps.js';
import type { QueryService } from './types.js';

interface QueryServiceDeps {
  runtime: DomainRuntimeDeps;
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

    return runtime.withDb(({ sqlite }) => {
      const queryRepository = runtime.repositories.query(sqlite);

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
    });
  },
});
