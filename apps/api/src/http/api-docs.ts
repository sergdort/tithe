export interface OpenApiTag {
  name: string;
  description: string;
}

export const openApiTags: OpenApiTag[] = [
  { name: 'System', description: 'Runtime health and status endpoints.' },
  { name: 'Categories', description: 'Category management endpoints.' },
  { name: 'Expenses', description: 'Expense CRUD endpoints.' },
  {
    name: 'Reimbursements',
    description: 'Reimbursement linking, close, and auto-match endpoints.',
  },
  { name: 'Commitments', description: 'Recurring commitment endpoints.' },
  { name: 'Reports', description: 'Aggregated reporting endpoints.' },
  { name: 'Query', description: 'Ad-hoc filtered query endpoint.' },
  { name: 'Monzo', description: 'Monzo OAuth connect, sync, and status endpoints.' },
];

export const genericObjectSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

export const uuidSchema = {
  type: 'string',
  format: 'uuid',
} as const;

export const isoDateTimeSchema = {
  type: 'string',
  format: 'date-time',
} as const;

export const successEnvelopeSchema = (
  dataSchema: Record<string, unknown> = genericObjectSchema,
): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'data', 'meta'],
  properties: {
    ok: { type: 'boolean', const: true },
    data: dataSchema,
    meta: {
      type: 'object',
      additionalProperties: true,
    },
  },
});

export const errorEnvelopeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'error'],
  properties: {
    ok: { type: 'boolean', const: false },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
} as const;

export const defaultErrorResponses = {
  400: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
} as const;

export const idParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: uuidSchema,
  },
} as const;

export interface ApiDocs {
  genericObjectSchema: typeof genericObjectSchema;
  uuidSchema: typeof uuidSchema;
  isoDateTimeSchema: typeof isoDateTimeSchema;
  successEnvelopeSchema: typeof successEnvelopeSchema;
  errorEnvelopeSchema: typeof errorEnvelopeSchema;
  defaultErrorResponses: typeof defaultErrorResponses;
  idParamsSchema: typeof idParamsSchema;
}

export const apiDocs: ApiDocs = {
  genericObjectSchema,
  uuidSchema,
  isoDateTimeSchema,
  successEnvelopeSchema,
  errorEnvelopeSchema,
  defaultErrorResponses,
  idParamsSchema,
};
