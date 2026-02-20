import { ok } from '@tithe/contracts';

describe('CLI envelope contract', () => {
  it('uses ok envelope shape for responses', () => {
    const payload = ok({ hello: 'world' });
    expect(payload).toEqual({
      ok: true,
      data: { hello: 'world' },
      meta: {},
    });
  });
});
