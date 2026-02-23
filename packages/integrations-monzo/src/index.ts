import { z } from 'zod';

const DEFAULT_MONZO_AUTH_BASE = 'https://auth.monzo.com';
const DEFAULT_MONZO_API_BASE = 'https://api.monzo.com';
const DEFAULT_TX_LIMIT = 100;

export const monzoTokenResponseSchema = z.object({
  access_token: z.string(),
  client_id: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  user_id: z.string().optional(),
});

export const monzoAccountSchema = z.object({
  id: z.string(),
  closed: z.boolean().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  type: z.string().optional(),
});

export const monzoAccountsResponseSchema = z.object({
  accounts: z.array(monzoAccountSchema),
});

export const monzoTransactionSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  description: z.string(),
  category: z.string().optional(),
  created: z.string(),
  settled: z.string().nullable().optional(),
  merchant: z
    .union([
      z.object({
        name: z.string().optional(),
        logo: z.string().optional(),
        emoji: z.string().optional(),
      }),
      z.string(),
    ])
    .nullable()
    .optional(),
});

export const monzoTransactionsResponseSchema = z.object({
  transactions: z.array(monzoTransactionSchema),
});

export type MonzoTokenResponse = z.infer<typeof monzoTokenResponseSchema>;
export type MonzoAccount = z.infer<typeof monzoAccountSchema>;
export type MonzoTransaction = z.infer<typeof monzoTransactionSchema>;

export interface MonzoClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl?: string;
  apiBaseUrl?: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}

export interface BuildAuthorizeUrlInput {
  state: string;
}

export interface ExchangeCodeInput {
  code: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface ListAccountsInput {
  accessToken: string;
}

export interface ListTransactionsInput {
  accessToken: string;
  accountId: string;
  since: string;
  before?: string;
  limit?: number;
}

export interface MonzoIntegrationClient {
  buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string;
  exchangeCode(input: ExchangeCodeInput): Promise<MonzoTokenResponse>;
  refreshToken(input: RefreshTokenInput): Promise<MonzoTokenResponse>;
  listAccounts(input: ListAccountsInput): Promise<MonzoAccount[]>;
  listTransactions(input: ListTransactionsInput): Promise<MonzoTransaction[]>;
}

export class MonzoApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 502, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MonzoApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const parseWithSchema = <T>(
  schema: z.ZodType<T>,
  payload: unknown,
  details: Record<string, unknown>,
): T => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new MonzoApiError('MONZO_RESPONSE_INVALID', 'Monzo response shape is invalid', 502, {
      ...details,
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const toIsoFromExpiresIn = (expiresIn?: number): string | null => {
  if (!expiresIn || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }

  return new Date(Date.now() + expiresIn * 1000).toISOString();
};

export const createMonzoIntegrationClient = (config: MonzoClientConfig): MonzoIntegrationClient => {
  const authBaseUrl = trimTrailingSlash(config.authBaseUrl ?? DEFAULT_MONZO_AUTH_BASE);
  const apiBaseUrl = trimTrailingSlash(config.apiBaseUrl ?? DEFAULT_MONZO_API_BASE);
  const scope = config.scope?.trim();
  const fetchImpl = config.fetchImpl ?? fetch;

  const postForm = async <T>({
    path,
    body,
    schema,
    context,
  }: {
    path: string;
    body: URLSearchParams;
    schema: z.ZodType<T>;
    context: string;
  }): Promise<T> => {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      throw new MonzoApiError(
        'MONZO_API_ERROR',
        `Monzo API request failed during ${context}`,
        response.status,
        {
          context,
          payload,
        },
      );
    }

    return parseWithSchema(schema, payload, { context, path });
  };

  const getJson = async <T>({
    path,
    searchParams,
    accessToken,
    schema,
    context,
  }: {
    path: string;
    searchParams?: URLSearchParams;
    accessToken: string;
    schema: z.ZodType<T>;
    context: string;
  }): Promise<T> => {
    const url = searchParams
      ? `${apiBaseUrl}${path}?${searchParams.toString()}`
      : `${apiBaseUrl}${path}`;

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      throw new MonzoApiError(
        'MONZO_API_ERROR',
        `Monzo API request failed during ${context}`,
        response.status,
        {
          context,
          payload,
        },
      );
    }

    return parseWithSchema(schema, payload, { context, path });
  };

  return {
    buildAuthorizeUrl({ state }: BuildAuthorizeUrlInput): string {
      const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        state,
      });
      if (scope) {
        query.set('scope', scope);
      }
      return `${authBaseUrl}/?${query.toString()}`;
    },

    async exchangeCode({ code }: ExchangeCodeInput): Promise<MonzoTokenResponse> {
      return postForm({
        path: '/oauth2/token',
        context: 'oauth_code_exchange',
        schema: monzoTokenResponseSchema,
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code,
        }),
      });
    },

    async refreshToken({ refreshToken }: RefreshTokenInput): Promise<MonzoTokenResponse> {
      return postForm({
        path: '/oauth2/token',
        context: 'oauth_refresh',
        schema: monzoTokenResponseSchema,
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
        }),
      });
    },

    async listAccounts({ accessToken }: ListAccountsInput): Promise<MonzoAccount[]> {
      const payload = await getJson({
        path: '/accounts',
        accessToken,
        schema: monzoAccountsResponseSchema,
        context: 'accounts_list',
      });

      return payload.accounts;
    },

    async listTransactions({
      accessToken,
      accountId,
      since,
      before,
      limit = DEFAULT_TX_LIMIT,
    }: ListTransactionsInput): Promise<MonzoTransaction[]> {
      const searchParams = new URLSearchParams({
        account_id: accountId,
        since,
        limit: String(limit),
      });
      searchParams.append('expand[]', 'merchant');
      if (before) {
        searchParams.set('before', before);
      }

      const payload = await getJson({
        path: '/transactions',
        accessToken,
        searchParams,
        schema: monzoTransactionsResponseSchema,
        context: 'transactions_list',
      });

      return payload.transactions;
    },
  };
};

export const tokenExpiresAtFromMonzoResponse = (payload: MonzoTokenResponse): string | null =>
  toIsoFromExpiresIn(payload.expires_in);
