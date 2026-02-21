import { ExpenseTrackerService } from '@tithe/domain';

import { type ApiDocs, apiDocs } from './api-docs.js';

export interface Actor {
  actor: string;
  channel: 'api';
}

export interface ActorRequest {
  ip: string;
  headers: Record<string, unknown>;
}

export interface AppContext {
  service: ExpenseTrackerService;
  actorFromRequest: (request: ActorRequest) => Actor;
  parseBoolean: (value: unknown) => boolean;
  docs: ApiDocs;
}

export interface CreateAppContextOptions {
  service?: ExpenseTrackerService;
  docs?: ApiDocs;
}

const actorFromRequest = (request: ActorRequest): Actor => {
  const actorHeader = request.headers['x-actor'];
  const actor = typeof actorHeader === 'string' ? actorHeader : request.ip;

  return {
    actor,
    channel: 'api',
  };
};

const parseBoolean = (value: unknown): boolean =>
  value === true || value === 'true' || value === '1';

export const createAppContext = (options: CreateAppContextOptions = {}): AppContext => ({
  service: options.service ?? new ExpenseTrackerService(),
  actorFromRequest,
  parseBoolean,
  docs: options.docs ?? apiDocs,
});
