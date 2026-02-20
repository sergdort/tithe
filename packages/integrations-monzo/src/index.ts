import { z } from 'zod';

export const monzoTransactionSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  amount: z.number(),
  currency: z.string(),
  description: z.string(),
  created: z.string(),
  merchant: z
    .object({
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type MonzoTransaction = z.infer<typeof monzoTransactionSchema>;

export interface MonzoSyncResult {
  imported: number;
  cursor?: string;
}

export interface MonzoIntegrationClient {
  connectStart(): Promise<{ authUrl?: string; status: string; message: string }>;
  handleCallback(code: string): Promise<{ status: string; message: string }>;
  syncNow(): Promise<MonzoSyncResult>;
}

export class MonzoNotConfiguredError extends Error {
  constructor() {
    super('Monzo integration is not configured yet.');
    this.name = 'MonzoNotConfiguredError';
  }
}
