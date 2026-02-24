import type { FastifyInstance } from 'fastify';

import { registerCategoryRoutes } from '../features/categories/routes.js';
import { registerCommitmentRoutes } from '../features/commitments/routes.js';
import { registerExpenseRoutes } from '../features/expenses/routes.js';
import { registerMonzoRoutes } from '../features/monzo/routes.js';
import { registerQueryRoutes } from '../features/query/routes.js';
import { registerReimbursementRoutes } from '../features/reimbursements/routes.js';
import { registerReportRoutes } from '../features/reports/routes.js';
import { registerSystemRoutes } from '../features/system/routes.js';

type FeatureRegistrar = (app: FastifyInstance) => void;

interface FeatureRouteRegistration {
  name: string;
  prefix?: string;
  registrar: FeatureRegistrar;
}

export const featureRouteRegistrations: readonly FeatureRouteRegistration[] = [
  { name: 'system', registrar: registerSystemRoutes },
  { name: 'categories', prefix: '/v1/categories', registrar: registerCategoryRoutes },
  { name: 'expenses', prefix: '/v1/expenses', registrar: registerExpenseRoutes },
  { name: 'reimbursements', prefix: '/v1/reimbursements', registrar: registerReimbursementRoutes },
  { name: 'commitments', prefix: '/v1', registrar: registerCommitmentRoutes },
  { name: 'reports', prefix: '/v1/reports', registrar: registerReportRoutes },
  { name: 'query', prefix: '/v1/query', registrar: registerQueryRoutes },
  { name: 'monzo', prefix: '/v1/integrations/monzo', registrar: registerMonzoRoutes },
];

const registerFeature = (
  app: FastifyInstance,
  registration: FeatureRouteRegistration,
  prefix?: string,
): void => {
  const plugin = async (featureApp: FastifyInstance): Promise<void> => {
    registration.registrar(featureApp);
  };

  if (prefix) {
    app.register(plugin, { prefix });
    return;
  }

  app.register(plugin);
};

export const registerFeatureRoutes = (app: FastifyInstance): void => {
  for (const registration of featureRouteRegistrations) {
    registerFeature(app, registration, registration.prefix);
  }
};
