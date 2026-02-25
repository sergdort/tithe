import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { type DomainServices, createDomainServices } from '@tithe/domain';

import { type ApiDocs, apiDocs } from './api-docs.js';

export interface Actor {
  actor: string;
  channel: 'api';
}

export type ActorRequest = Pick<FastifyRequest, 'ip' | 'headers'>;

export interface TitheContext {
  services: DomainServices;
  actorFromRequest: (request: ActorRequest) => Actor;
  parseBoolean: (value: unknown) => boolean;
  docs: ApiDocs;
}

export interface TithePluginOptions {
  services?: DomainServices;
  docs?: ApiDocs;
  createServices?: () => ClosableDomainServicesLike;
}

type ClosableDomainServicesLike = DomainServices & {
  close: () => void;
};

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

declare module 'fastify' {
  interface FastifyInstance {
    tithe: TitheContext;
  }
}

export const tithePlugin: FastifyPluginAsync<TithePluginOptions> = async (app, options) => {
  let ownedServices: ClosableDomainServicesLike | null = null;
  const createOwnedServices =
    options.createServices ??
    (() => createDomainServices() as unknown as ClosableDomainServicesLike);
  const services = (() => {
    if (options.services) {
      return options.services;
    }

    ownedServices = createOwnedServices();
    return ownedServices;
  })();

  app.decorate('tithe', {
    services,
    actorFromRequest,
    parseBoolean,
    docs: options.docs ?? apiDocs,
  });

  app.addHook('onClose', async () => {
    ownedServices?.close();
  });
};

export default tithePlugin;
