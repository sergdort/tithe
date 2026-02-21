const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export type ApiLogLevel = (typeof LOG_LEVELS)[number];

export interface ApiRuntimeConfig {
  host: string;
  port: number;
  logLevel: ApiLogLevel;
  corsAllowedOrigins: string[];
}

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8787;
const DEFAULT_LOG_LEVEL: ApiLogLevel = 'info';
const DEFAULT_CORS_ALLOWED_ORIGINS = '*';

const parseInteger = (
  rawValue: string | undefined,
  fieldName: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}`);
  }

  return parsed;
};

const parseString = (rawValue: string | undefined, fieldName: string, fallback: string): string => {
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }

  const normalized = rawValue.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
};

const parseLogLevel = (rawValue: string | undefined): ApiLogLevel => {
  const value = parseString(rawValue, 'LOG_LEVEL', DEFAULT_LOG_LEVEL) as string;
  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as ApiLogLevel;
  }

  throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
};

const parseCorsAllowedOrigins = (rawValue: string | undefined): string[] => {
  const value = parseString(rawValue, 'CORS_ALLOWED_ORIGINS', DEFAULT_CORS_ALLOWED_ORIGINS);
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length === 0 ? [DEFAULT_CORS_ALLOWED_ORIGINS] : origins;
};

export const loadApiRuntimeConfig = (
  env: Record<string, string | undefined> = process.env,
): ApiRuntimeConfig => ({
  host: parseString(env.HOST, 'HOST', DEFAULT_HOST),
  port: parseInteger(env.PORT, 'PORT', DEFAULT_PORT, 1, 65_535),
  logLevel: parseLogLevel(env.LOG_LEVEL),
  corsAllowedOrigins: parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
});

export const resolveCorsOrigin = (allowedOrigins: readonly string[]): true | string[] =>
  allowedOrigins.includes('*') ? true : [...allowedOrigins];
