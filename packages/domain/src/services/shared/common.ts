import crypto from 'node:crypto';

import { AppError } from '../../errors.js';
import type { ActorContext } from '../../types.js';

export const DEFAULT_ACTOR: ActorContext = {
  actor: 'system',
  channel: 'system',
};

export const toIso = (date: Date): string => date.toISOString();

export const normalizeCurrency = (currency: string): string => currency.trim().toUpperCase();

export const assertDate = (value: string, field: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a valid ISO-8601 date`, 400, {
      field,
      value,
    });
  }

  return date.toISOString();
};

export const toRruleDate = (value: string): string =>
  value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export const operationHash = (action: string, payloadJson: string): string =>
  crypto.createHash('sha256').update(`${action}:${payloadJson}`).digest('hex');
