import type { FastifyInstance } from 'fastify';

import { registerCategoryRoutes } from '../features/categories/routes.js';
import { registerCommitmentRoutes } from '../features/commitments/routes.js';
import { registerExpenseRoutes } from '../features/expenses/routes.js';
import { registerMonzoRoutes } from '../features/monzo/routes.js';
import { registerQueryRoutes } from '../features/query/routes.js';
import { registerReportRoutes } from '../features/reports/routes.js';
import { registerSystemRoutes } from '../features/system/routes.js';
import type { AppContext } from './app-context.js';

type FeatureRegistrar = (app: FastifyInstance, ctx: AppContext) => void;

const registerFeature = (
  app: FastifyInstance,
  ctx: AppContext,
  registrar: FeatureRegistrar,
  prefix?: string,
): void => {
  const plugin = (
    featureApp: FastifyInstance,
    _opts: object,
    done: (err?: Error) => void,
  ): void => {
    registrar(featureApp, ctx);
    done();
  };

  if (prefix) {
    app.register(plugin, { prefix });
    return;
  }

  app.register(plugin);
};

export const registerFeatureRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  registerFeature(app, ctx, registerSystemRoutes);
  registerFeature(app, ctx, registerCategoryRoutes, '/v1/categories');
  registerFeature(app, ctx, registerExpenseRoutes, '/v1/expenses');
  registerFeature(app, ctx, registerCommitmentRoutes, '/v1');
  registerFeature(app, ctx, registerReportRoutes, '/v1/reports');
  registerFeature(app, ctx, registerQueryRoutes, '/v1/query');
  registerFeature(app, ctx, registerMonzoRoutes, '/v1/integrations/monzo');
};
