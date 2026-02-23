import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testsRoot, '../..');
const cliEntry = path.resolve(workspaceRoot, 'apps/cli/src/index.ts');

const runCli = (args: string[]) =>
  spawnSync('node', ['--import', 'tsx', cliEntry, ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env },
  });

describe('CLI web command', () => {
  it('prints help and exits successfully without a subcommand', () => {
    const result = runCli([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: tithe');
  });

  it('shows web command in help output', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('web');
  });

  it('returns validation error for invalid mode', () => {
    const result = runCli(['--json', 'web', '--mode', 'invalid']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for api port lower than range', () => {
    const result = runCli(['--json', 'web', '--api-port', '0']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for pwa port above range', () => {
    const result = runCli(['--json', 'web', '--pwa-port', '70000']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates report monthly-ledger month format before running DB work', () => {
    const result = runCli(['--json', 'report', 'monthly-ledger', '--month', '2026/02']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects mixing monthly-ledger month with explicit range', () => {
    const result = runCli([
      '--json',
      'report',
      'monthly-ledger',
      '--month',
      '2026-02',
      '--from',
      '2026-02-01T00:00:00.000Z',
      '--to',
      '2026-03-01T00:00:00.000Z',
    ]);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates monzo sync month format before running DB work', () => {
    const result = runCli(['--json', 'monzo', 'sync', '--month', '2026/02']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects mixing monzo sync month with explicit range', () => {
    const result = runCli([
      '--json',
      'monzo',
      'sync',
      '--month',
      '2026-02',
      '--from',
      '2026-02-01T00:00:00.000Z',
      '--to',
      '2026-03-01T00:00:00.000Z',
    ]);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires paired from/to options for monzo sync', () => {
    const fromOnly = runCli(['--json', 'monzo', 'sync', '--from', '2026-02-01T00:00:00.000Z']);
    const fromOnlyPayload = JSON.parse(fromOnly.stdout);
    expect(fromOnly.status).toBe(1);
    expect(fromOnlyPayload.ok).toBe(false);
    expect(fromOnlyPayload.error.code).toBe('VALIDATION_ERROR');

    const toOnly = runCli(['--json', 'monzo', 'sync', '--to', '2026-03-01T00:00:00.000Z']);
    const toOnlyPayload = JSON.parse(toOnly.stdout);
    expect(toOnly.status).toBe(1);
    expect(toOnlyPayload.ok).toBe(false);
    expect(toOnlyPayload.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts monzo sync --override syntax', () => {
    const result = runCli(['--json', 'monzo', 'sync', '--month', '2026-02', '--override']);
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).not.toBe('VALIDATION_ERROR');
  });
});
