import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';

const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const modulePath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(modulePath), '../../..');

const daemonShutdownTimeoutMs = 10_000;
const daemonStatusPollMs = 200;
const restartBackoffBaseMs = 1_000;
const restartBackoffMaxMs = 30_000;
const restartStableWindowMs = 60_000;
const tailscaleStatusTimeoutMs = 2_000;

type WebMode = 'dev' | 'preview';
type WebServiceLabel = 'api' | 'pwa';
type WebScript = 'dev' | 'start' | 'build';
type DaemonLifecycleStatus =
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'crashed';

export interface WebCommandOptions {
  mode?: string;
  apiPort?: string;
  pwaPort?: string;
  daemon?: boolean;
  status?: boolean;
  stop?: boolean;
}

export interface WebSupervisorCommandOptions {
  mode?: string;
  apiPort?: string;
  pwaPort?: string;
  runId?: string;
}

interface ManagedProcess {
  label: WebServiceLabel;
  child: ChildProcess;
  flushLogs: () => void;
}

interface ResolvedWebRuntime {
  mode: WebMode;
  apiScript: 'dev' | 'start';
  pwaScript: 'dev' | 'start';
  apiEnv: NodeJS.ProcessEnv;
  pwaEnv: NodeJS.ProcessEnv;
  resolvedApiPort: number;
  resolvedPwaPort: number;
  resolvedApiBase: string;
}

interface WebAccessInfo {
  local: {
    apiUrl: string;
    pwaUrl: string;
  };
  tailnet: {
    apiUrl?: string;
    pwaUrl?: string;
    host?: string;
  };
  warning?: string;
}

interface WebDaemonServiceState {
  package: string;
  script: 'dev' | 'start';
  port: number;
  pid?: number;
  restartCount: number;
  lastStartAt?: string;
  lastExitAt?: string;
  lastExit?: {
    code: number | null;
    signal: NodeJS.Signals | null;
  };
}

interface WebDaemonState {
  version: 1;
  runId: string;
  pid: number;
  mode: WebMode;
  lifecycle: 'daemon';
  workspaceRoot: string;
  startedAt: string;
  updatedAt: string;
  status: DaemonLifecycleStatus;
  logFile: string;
  access: WebAccessInfo;
  lastEvent?: string;
  services: {
    api: WebDaemonServiceState;
    pwa: WebDaemonServiceState;
  };
}

interface WebDaemonStatusResponse {
  running: boolean;
  pid?: number;
  pidFile: string;
  logFile: string;
  stateFile: string;
  state?: WebDaemonState;
}

interface DaemonPaths {
  dir: string;
  pidFile: string;
  logFile: string;
  stateFile: string;
}

interface SupervisorServiceRuntime {
  label: WebServiceLabel;
  script: 'dev' | 'start';
  env: NodeJS.ProcessEnv;
  restartCount: number;
  failureStreak: number;
  managed?: ManagedProcess;
  startedAtMs?: number;
}

const nowIso = () => new Date().toISOString();

const buildDaemonPaths = (dir: string): DaemonPaths => ({
  dir,
  pidFile: path.join(dir, 'web-daemon.pid'),
  logFile: path.join(dir, 'web-daemon.log'),
  stateFile: path.join(dir, 'web-daemon.state.json'),
});

const daemonDirCandidates = (): string[] => {
  const overrideDir = process.env.TITHE_WEB_DAEMON_DIR?.trim();
  const candidates = overrideDir
    ? [path.resolve(overrideDir)]
    : [path.join(os.homedir(), '.tithe'), path.join(workspaceRoot, '.tithe')];

  return Array.from(new Set(candidates));
};

const hasDaemonStateFile = (paths: DaemonPaths): boolean =>
  fs.existsSync(paths.pidFile) || fs.existsSync(paths.stateFile);

const ensureDirWritable = (dir: string): boolean => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveDaemonPaths = (mode: 'read' | 'write'): DaemonPaths => {
  const candidates = daemonDirCandidates().map((dir) => buildDaemonPaths(dir));
  const existing = candidates.find((candidate) => hasDaemonStateFile(candidate));
  if (existing) {
    return existing;
  }

  if (mode === 'read') {
    return candidates[0];
  }

  const writable = candidates.find((candidate) => ensureDirWritable(candidate.dir));
  return writable ?? candidates[0];
};

let cachedDaemonPaths: DaemonPaths | undefined;

const getDaemonPaths = (mode: 'read' | 'write' = 'read'): DaemonPaths => {
  if (cachedDaemonPaths) {
    if (mode === 'read') {
      return cachedDaemonPaths;
    }

    if (ensureDirWritable(cachedDaemonPaths.dir)) {
      return cachedDaemonPaths;
    }
  }

  const resolved = resolveDaemonPaths(mode);
  cachedDaemonPaths = resolved;
  return resolved;
};

const toPortOrFallback = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
};

const resolveApiHost = (value: string | undefined): string => {
  const host = value?.trim();
  if (!host) {
    return '127.0.0.1';
  }

  if (host === '0.0.0.0' || host === '::' || host === '[::]') {
    return '127.0.0.1';
  }

  return host;
};

const rewriteApiBasePort = (base: string | undefined, port: number): string | undefined => {
  if (!base) {
    return undefined;
  }

  try {
    const parsed = new URL(base);
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const parseMode = (value?: string): WebMode => {
  const mode = value ?? 'preview';
  if (mode === 'dev' || mode === 'preview') {
    return mode;
  }

  throw new AppError('VALIDATION_ERROR', '--mode must be one of: dev, preview.', 400, {
    option: 'mode',
    value: mode,
  });
};

const parsePort = (value: string | undefined, optionName: '--api-port' | '--pwa-port') => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${optionName} must be an integer between 1 and 65535.`,
      400,
      {
        option: optionName,
        value,
      },
    );
  }

  return parsed;
};

const pipeWithPrefix = (
  stream: Readable | null,
  target: NodeJS.WriteStream,
  prefix: string,
): (() => void) => {
  if (!stream) {
    return () => {};
  }

  stream.setEncoding('utf8');
  let buffer = '';

  const writeLine = (line: string) => {
    target.write(`${prefix} ${line}\n`);
  };

  const onData = (chunk: string) => {
    buffer += chunk;

    while (true) {
      const lineBreak = buffer.indexOf('\n');
      if (lineBreak < 0) {
        return;
      }

      const line = buffer.slice(0, lineBreak).replace(/\r$/, '');
      buffer = buffer.slice(lineBreak + 1);
      writeLine(line);
    }
  };

  stream.on('data', onData);

  return () => {
    stream.off('data', onData);
    if (buffer.length > 0) {
      writeLine(buffer.replace(/\r$/, ''));
      buffer = '';
    }
  };
};

const startManagedProcess = (
  label: WebServiceLabel,
  script: WebScript,
  env: NodeJS.ProcessEnv,
): ManagedProcess => {
  const child = spawn(PNPM_BIN, ['--filter', `@tithe/${label}`, script], {
    cwd: workspaceRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const flushStdout = pipeWithPrefix(child.stdout, process.stdout, `[${label}]`);
  const flushStderr = pipeWithPrefix(child.stderr, process.stderr, `[${label}]`);

  return {
    label,
    child,
    flushLogs: () => {
      flushStdout();
      flushStderr();
    },
  };
};

const formatExit = (code: number | null, signal: NodeJS.Signals | null): string => {
  if (signal) {
    return `with signal ${signal}`;
  }
  if (code === null) {
    return 'without an exit code';
  }
  return `with code ${code}`;
};

const runBuild = async (label: WebServiceLabel, env: NodeJS.ProcessEnv): Promise<void> => {
  const task = startManagedProcess(label, 'build', env);

  await new Promise<void>((resolve, reject) => {
    task.child.once('error', (error) => {
      task.flushLogs();
      reject(
        new AppError(
          'INTERNAL_ERROR',
          `Failed to start ${label} build process: ${error.message}`,
          500,
        ),
      );
    });

    task.child.once('close', (code, signal) => {
      task.flushLogs();

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new AppError(
          'INTERNAL_ERROR',
          `${label} build process exited ${formatExit(code, signal)}.`,
          500,
        ),
      );
    });
  });
};

const stopAll = (processes: ManagedProcess[], signal: NodeJS.Signals = 'SIGTERM') => {
  for (const managed of processes) {
    if (managed.child.exitCode === null && managed.child.signalCode === null) {
      managed.child.kill(signal);
    }
  }
};

const runServices = async (processes: ManagedProcess[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let shuttingDown = false;
    let runningCount = processes.length;

    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      resolve();
    };

    const finishReject = (error: AppError) => {
      if (settled) {
        return;
      }
      settled = true;
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      reject(error);
    };

    const handleSignal = (signal: NodeJS.Signals) => {
      shuttingDown = true;
      stopAll(processes, signal);
    };

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    for (const managed of processes) {
      managed.child.once('error', (error) => {
        if (settled) {
          return;
        }

        stopAll(processes);
        finishReject(
          new AppError(
            'INTERNAL_ERROR',
            `Failed to start ${managed.label} process: ${error.message}`,
            500,
          ),
        );
      });

      managed.child.once('close', (code, signal) => {
        managed.flushLogs();
        runningCount -= 1;

        if (settled) {
          return;
        }

        if (shuttingDown) {
          if (runningCount === 0) {
            finishResolve();
          }
          return;
        }

        if (code === 0 && runningCount === 0) {
          finishResolve();
          return;
        }

        if (code !== 0) {
          stopAll(processes);
          finishReject(
            new AppError(
              'INTERNAL_ERROR',
              `${managed.label} process exited ${formatExit(code, signal)}.`,
              500,
            ),
          );
          return;
        }

        stopAll(processes);
        finishReject(
          new AppError('INTERNAL_ERROR', `${managed.label} process exited unexpectedly.`, 500),
        );
      });
    }
  });
};

const resolveWebRuntime = (options: {
  mode?: string;
  apiPort?: string;
  pwaPort?: string;
}): ResolvedWebRuntime => {
  const mode = parseMode(options.mode);
  const apiPort = parsePort(options.apiPort, '--api-port');
  const pwaPort = parsePort(options.pwaPort, '--pwa-port');
  const apiScript = mode === 'dev' ? 'dev' : 'start';
  const pwaScript = mode === 'dev' ? 'dev' : 'start';

  const apiEnv: NodeJS.ProcessEnv = { ...process.env };
  if (apiPort !== undefined) {
    apiEnv.PORT = String(apiPort);
  }
  const resolvedApiPort = toPortOrFallback(apiEnv.PORT, 8787);
  const resolvedApiHost = resolveApiHost(apiEnv.HOST);

  let pwaEnv: NodeJS.ProcessEnv = { ...process.env };
  const pwaPortFallback = mode === 'dev' ? 5173 : 4173;
  if (pwaPort !== undefined) {
    if (mode === 'dev') {
      pwaEnv.PWA_PORT = String(pwaPort);
    } else {
      pwaEnv.PWA_PREVIEW_PORT = String(pwaPort);
    }
  }

  const configuredApiBase = pwaEnv.VITE_API_BASE;
  const fallbackApiBase = `http://${resolvedApiHost}:${resolvedApiPort}/v1`;

  const resolvedApiBase =
    apiPort !== undefined
      ? (rewriteApiBasePort(configuredApiBase, resolvedApiPort) ?? fallbackApiBase)
      : (configuredApiBase ?? fallbackApiBase);

  const injectedApiBase = apiPort !== undefined ? resolvedApiBase : configuredApiBase;

  if (injectedApiBase) {
    pwaEnv.VITE_API_BASE = injectedApiBase;
  } else {
    const { VITE_API_BASE: _unusedApiBase, ...remainingPwaEnv } = pwaEnv;
    pwaEnv = remainingPwaEnv;
  }

  const resolvedPwaPort =
    mode === 'dev'
      ? toPortOrFallback(pwaEnv.PWA_PORT, pwaPortFallback)
      : toPortOrFallback(pwaEnv.PWA_PREVIEW_PORT, pwaPortFallback);

  return {
    mode,
    apiScript,
    pwaScript,
    apiEnv,
    pwaEnv,
    resolvedApiPort,
    resolvedPwaPort,
    resolvedApiBase,
  };
};

const trimTrailingDot = (value: string): string => value.replace(/\.$/, '');

const resolveWebAccessInfo = (apiPort: number, pwaPort: number): WebAccessInfo => {
  const localApiUrl = `http://127.0.0.1:${apiPort}/v1`;
  const localPwaUrl = `http://127.0.0.1:${pwaPort}`;

  const status = spawnSync('tailscale', ['status', '--json'], {
    encoding: 'utf8',
    timeout: tailscaleStatusTimeoutMs,
  });

  if (status.error) {
    const error = status.error as NodeJS.ErrnoException;
    return {
      local: {
        apiUrl: localApiUrl,
        pwaUrl: localPwaUrl,
      },
      tailnet: {},
      warning:
        error.code === 'ENOENT'
          ? 'Tailscale CLI not found; Tailnet URLs are unavailable.'
          : `Failed to query Tailscale status: ${error.message}`,
    };
  }

  if (status.signal) {
    return {
      local: {
        apiUrl: localApiUrl,
        pwaUrl: localPwaUrl,
      },
      tailnet: {},
      warning: `Tailscale status command timed out after ${tailscaleStatusTimeoutMs}ms.`,
    };
  }

  if (status.status !== 0) {
    const stderr = status.stderr?.trim();
    return {
      local: {
        apiUrl: localApiUrl,
        pwaUrl: localPwaUrl,
      },
      tailnet: {},
      warning: stderr
        ? `Tailscale status unavailable: ${stderr}`
        : 'Tailscale status unavailable; Tailnet URLs are unavailable.',
    };
  }

  try {
    const parsed = JSON.parse(status.stdout) as Record<string, unknown>;
    const self = parsed.Self as Record<string, unknown> | undefined;
    const backendState =
      typeof parsed.BackendState === 'string' ? (parsed.BackendState as string) : undefined;

    const dnsName =
      typeof self?.DNSName === 'string' ? trimTrailingDot(self.DNSName as string) : undefined;

    const hostName = typeof self?.HostName === 'string' ? (self.HostName as string).trim() : '';
    const magicSuffix =
      typeof parsed.MagicDNSSuffix === 'string'
        ? trimTrailingDot((parsed.MagicDNSSuffix as string).trim())
        : '';

    const tailscaleIps = Array.isArray(self?.TailscaleIPs)
      ? (self?.TailscaleIPs as unknown[]).filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : [];

    const host =
      dnsName ||
      (hostName && magicSuffix ? `${hostName}.${magicSuffix}` : undefined) ||
      tailscaleIps[0];

    let warning: string | undefined;
    if (!host) {
      warning = 'Tailscale is available, but no Tailnet hostname or IP was detected.';
    } else if (backendState && backendState !== 'Running') {
      warning = `Tailscale backend state is ${backendState}; Tailnet access may be unavailable.`;
    }

    return {
      local: {
        apiUrl: localApiUrl,
        pwaUrl: localPwaUrl,
      },
      tailnet: {
        host,
        apiUrl: host ? `http://${host}:${apiPort}/v1` : undefined,
        pwaUrl: host ? `http://${host}:${pwaPort}` : undefined,
      },
      warning,
    };
  } catch {
    return {
      local: {
        apiUrl: localApiUrl,
        pwaUrl: localPwaUrl,
      },
      tailnet: {},
      warning: 'Failed to parse Tailscale status JSON; Tailnet URLs are unavailable.',
    };
  }
};

const ensureDaemonDir = () => {
  const paths = getDaemonPaths('write');
  fs.mkdirSync(paths.dir, { recursive: true });
};

const writeJsonFile = (filePath: string, value: unknown) => {
  ensureDaemonDir();
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(value, null, 2);
  fs.writeFileSync(tempFile, serialized);

  try {
    if (process.platform === 'win32' && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && (code === 'EEXIST' || code === 'EPERM')) {
      fs.writeFileSync(filePath, serialized);
      return;
    }

    throw error;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
};

const readJsonFile = <T>(filePath: string): T | undefined => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    return undefined;
  }
};

const readDaemonPid = (): number | undefined => {
  try {
    const paths = getDaemonPaths('read');
    const raw = fs.readFileSync(paths.pidFile, 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) {
      return undefined;
    }
    return pid;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    return undefined;
  }
};

const writeDaemonPid = (pid: number) => {
  ensureDaemonDir();
  const paths = getDaemonPaths('write');
  fs.writeFileSync(paths.pidFile, `${pid}\n`);
};

const removeDaemonPidFile = () => {
  try {
    const paths = getDaemonPaths('read');
    fs.unlinkSync(paths.pidFile);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
};

const isPidRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return false;
    }
    if (code === 'EPERM') {
      return true;
    }
    return false;
  }
};

const loadDaemonState = (): WebDaemonState | undefined =>
  readJsonFile<WebDaemonState>(getDaemonPaths('read').stateFile);

const persistDaemonState = (state: WebDaemonState) => {
  state.updatedAt = nowIso();
  writeJsonFile(getDaemonPaths('write').stateFile, state);
};

const createDaemonState = (
  runtime: ResolvedWebRuntime,
  runId: string,
  pid: number,
  access: WebAccessInfo,
): WebDaemonState => ({
  version: 1,
  runId,
  pid,
  mode: runtime.mode,
  lifecycle: 'daemon',
  workspaceRoot,
  startedAt: nowIso(),
  updatedAt: nowIso(),
  status: 'starting',
  logFile: getDaemonPaths('write').logFile,
  access,
  services: {
    api: {
      package: '@tithe/api',
      script: runtime.apiScript,
      port: runtime.resolvedApiPort,
      restartCount: 0,
    },
    pwa: {
      package: '@tithe/pwa',
      script: runtime.pwaScript,
      port: runtime.resolvedPwaPort,
      restartCount: 0,
    },
  },
});

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const resolveCliEntryPath = (): string => {
  if (process.argv[1]) {
    return process.argv[1];
  }

  const extension = path.extname(modulePath);
  return path.resolve(path.dirname(modulePath), extension === '.ts' ? 'index.ts' : 'index.js');
};

const readWebDaemonStatus = (): WebDaemonStatusResponse => {
  const paths = getDaemonPaths('read');
  const state = loadDaemonState();
  const pidFromFile = readDaemonPid();
  const pid = pidFromFile ?? state?.pid;
  const running = pid !== undefined ? isPidRunning(pid) : false;

  if (pidFromFile !== undefined && !running) {
    removeDaemonPidFile();
  }

  return {
    running,
    pid: running ? pid : undefined,
    pidFile: paths.pidFile,
    logFile: paths.logFile,
    stateFile: paths.stateFile,
    state,
  };
};

const startWebDaemon = async (runtime: ResolvedWebRuntime, json: boolean): Promise<void> => {
  ensureDaemonDir();
  const paths = getDaemonPaths('write');

  const existingPid = readDaemonPid();
  if (existingPid !== undefined && isPidRunning(existingPid)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Web daemon is already running (pid ${existingPid}).`,
      400,
      {
        pid: existingPid,
      },
    );
  }

  if (existingPid !== undefined && !isPidRunning(existingPid)) {
    removeDaemonPidFile();
  }

  const runId = randomUUID();
  const access = resolveWebAccessInfo(runtime.resolvedApiPort, runtime.resolvedPwaPort);

  const cliEntryPath = resolveCliEntryPath();
  const logFd = fs.openSync(paths.logFile, 'a');

  const supervisor = spawn(
    process.execPath,
    [
      ...process.execArgv,
      cliEntryPath,
      '--json',
      'web-supervisor',
      '--mode',
      runtime.mode,
      '--api-port',
      String(runtime.resolvedApiPort),
      '--pwa-port',
      String(runtime.resolvedPwaPort),
      '--run-id',
      runId,
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        VITE_API_BASE: runtime.resolvedApiBase,
        TITHE_WEB_DAEMON_DIR: paths.dir,
      },
      detached: true,
      stdio: ['ignore', logFd, logFd],
    },
  );

  fs.closeSync(logFd);

  if (!supervisor.pid) {
    throw new AppError('INTERNAL_ERROR', 'Failed to start web daemon supervisor.', 500);
  }

  writeDaemonPid(supervisor.pid);

  const state = createDaemonState(runtime, runId, supervisor.pid, access);
  state.lastEvent = 'Daemon supervisor spawned.';
  persistDaemonState(state);

  supervisor.unref();

  const payload = {
    command: 'web',
    mode: runtime.mode,
    lifecycle: 'daemon',
    daemon: {
      status: 'starting' as const,
      pid: supervisor.pid,
      pidFile: paths.pidFile,
      logFile: paths.logFile,
      stateFile: paths.stateFile,
    },
    services: {
      api: {
        package: '@tithe/api',
        script: runtime.apiScript,
        port: runtime.resolvedApiPort,
        baseUrl: runtime.resolvedApiBase,
      },
      pwa: {
        package: '@tithe/pwa',
        script: runtime.pwaScript,
        port: runtime.resolvedPwaPort,
      },
    },
    access,
    warnings: access.warning ? [access.warning] : [],
  };

  if (json) {
    console.log(JSON.stringify(ok(payload), null, 2));
    return;
  }

  console.log(`Started web daemon (pid ${supervisor.pid}) in ${runtime.mode} mode.`);
  console.log(`PWA local: ${access.local.pwaUrl}`);
  if (access.tailnet.pwaUrl) {
    console.log(`PWA tailnet: ${access.tailnet.pwaUrl}`);
  }
  if (access.warning) {
    console.warn(`Warning: ${access.warning}`);
  }
  console.log('Status: tithe --json web --status');
  console.log('Stop: tithe --json web --stop');
};

const stopWebDaemon = async (): Promise<{
  wasRunning: boolean;
  stopped: boolean;
  pid?: number;
  timedOut?: boolean;
  permissionDenied?: boolean;
}> => {
  const pid = readDaemonPid();
  if (pid === undefined || !isPidRunning(pid)) {
    removeDaemonPidFile();
    return {
      wasRunning: false,
      stopped: true,
    };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      removeDaemonPidFile();
      return {
        wasRunning: false,
        stopped: true,
      };
    }

    if (code === 'EPERM') {
      return {
        wasRunning: true,
        stopped: false,
        pid,
        permissionDenied: true,
      };
    }

    throw error;
  }

  const deadline = Date.now() + daemonShutdownTimeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      removeDaemonPidFile();
      return {
        wasRunning: true,
        stopped: true,
        pid,
      };
    }

    await sleep(daemonStatusPollMs);
  }

  return {
    wasRunning: true,
    stopped: false,
    pid,
    timedOut: true,
  };
};

const runSupervisorLoop = async (
  runtime: ResolvedWebRuntime,
  state: WebDaemonState,
  services: Record<WebServiceLabel, SupervisorServiceRuntime>,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let shuttingDown = false;
    const restartTimers = new Map<WebServiceLabel, NodeJS.Timeout>();

    const stopChildren = (signal: NodeJS.Signals = 'SIGTERM') => {
      for (const service of Object.values(services)) {
        const managed = service.managed;
        if (!managed) {
          continue;
        }

        if (managed.child.exitCode === null && managed.child.signalCode === null) {
          managed.child.kill(signal);
        }
      }
    };

    const persist = () => {
      persistDaemonState(state);
    };

    const hasRunningChildren = (): boolean =>
      Object.values(services).some(
        (service) =>
          service.managed !== undefined &&
          service.managed.child.exitCode === null &&
          service.managed.child.signalCode === null,
      );

    const cleanup = () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      for (const timer of restartTimers.values()) {
        clearTimeout(timer);
      }
      restartTimers.clear();
    };

    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const finishReject = (error: AppError) => {
      if (settled) {
        return;
      }
      settled = true;
      shuttingDown = true;
      stopChildren('SIGTERM');
      cleanup();
      reject(error);
    };

    const refreshOverallStatus = () => {
      if (shuttingDown) {
        state.status = 'stopping';
      } else if (Object.values(services).every((service) => service.managed !== undefined)) {
        state.status = 'running';
      } else if (state.status === 'starting') {
        state.status = 'starting';
      } else {
        state.status = 'degraded';
      }
      persist();
    };

    const handleSignal = (signal: NodeJS.Signals) => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      state.status = 'stopping';
      state.lastEvent = `Received ${signal}; stopping services.`;
      persist();

      for (const timer of restartTimers.values()) {
        clearTimeout(timer);
      }
      restartTimers.clear();

      stopChildren('SIGTERM');

      if (!hasRunningChildren()) {
        finishResolve();
      }
    };

    const startService = (label: WebServiceLabel) => {
      const service = services[label];
      let managed: ManagedProcess;

      try {
        managed = startManagedProcess(label, service.script, service.env);
      } catch (error) {
        finishReject(
          new AppError(
            'INTERNAL_ERROR',
            `Failed to spawn ${label} process: ${error instanceof Error ? error.message : String(error)}`,
            500,
          ),
        );
        return;
      }

      service.managed = managed;
      service.startedAtMs = Date.now();

      state.services[label].pid = managed.child.pid ?? undefined;
      state.services[label].lastStartAt = nowIso();
      state.lastEvent = `${label} started (pid ${managed.child.pid ?? 'unknown'}).`;
      refreshOverallStatus();

      managed.child.once('error', (error) => {
        if (settled || shuttingDown) {
          return;
        }

        state.status = 'degraded';
        state.lastEvent = `${label} process error: ${error.message}`;
        persist();
      });

      managed.child.once('close', (code, signal) => {
        managed.flushLogs();
        service.managed = undefined;

        state.services[label].pid = undefined;
        state.services[label].lastExitAt = nowIso();
        state.services[label].lastExit = {
          code,
          signal,
        };

        if (shuttingDown) {
          refreshOverallStatus();
          if (!hasRunningChildren()) {
            finishResolve();
          }
          return;
        }

        const uptimeMs = service.startedAtMs ? Date.now() - service.startedAtMs : 0;
        if (uptimeMs > restartStableWindowMs) {
          service.failureStreak = 0;
        } else {
          service.failureStreak += 1;
        }

        service.restartCount += 1;
        state.services[label].restartCount = service.restartCount;

        const cappedExponent = Math.min(service.failureStreak, 5);
        const backoffMs = Math.min(restartBackoffMaxMs, restartBackoffBaseMs * 2 ** cappedExponent);

        state.status = 'degraded';
        state.lastEvent = `${label} exited ${formatExit(code, signal)}. Restarting in ${backoffMs}ms.`;
        persist();

        const existingTimer = restartTimers.get(label);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          restartTimers.delete(label);

          if (shuttingDown || settled) {
            return;
          }

          startService(label);
        }, backoffMs);

        restartTimers.set(label, timer);
      });
    };

    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    startService('api');
    startService('pwa');

    state.status = 'running';
    state.lastEvent = 'Supervisor started API and PWA.';
    persist();

    if (!hasRunningChildren()) {
      finishReject(new AppError('INTERNAL_ERROR', 'Supervisor failed to start services.', 500));
    }
  });
};

const validateControlOptions = (options: WebCommandOptions) => {
  const daemon = options.daemon === true;
  const status = options.status === true;
  const stop = options.stop === true;

  const enabledControls = [daemon, status, stop].filter(Boolean).length;
  if (enabledControls > 1) {
    throw new AppError('VALIDATION_ERROR', 'Use only one of: --daemon, --status, --stop.', 400, {
      daemon,
      status,
      stop,
    });
  }

  if (
    (status || stop) &&
    (options.mode !== undefined || options.apiPort !== undefined || options.pwaPort !== undefined)
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      '--status/--stop cannot be combined with --mode, --api-port, or --pwa-port.',
      400,
    );
  }
};

export const runWebSupervisorCommand = async (
  options: WebSupervisorCommandOptions,
): Promise<void> => {
  const runtime = resolveWebRuntime({
    mode: options.mode,
    apiPort: options.apiPort,
    pwaPort: options.pwaPort,
  });

  const runId = options.runId ?? randomUUID();
  const access = resolveWebAccessInfo(runtime.resolvedApiPort, runtime.resolvedPwaPort);

  const state = createDaemonState(runtime, runId, process.pid, access);
  state.lastEvent = 'Daemon supervisor booting.';

  writeDaemonPid(process.pid);
  persistDaemonState(state);

  try {
    if (runtime.mode === 'preview') {
      state.status = 'starting';
      state.lastEvent = 'Running preview builds before daemon startup.';
      persistDaemonState(state);
      await runBuild('api', runtime.apiEnv);
      await runBuild('pwa', runtime.pwaEnv);
    }

    const services: Record<WebServiceLabel, SupervisorServiceRuntime> = {
      api: {
        label: 'api',
        script: runtime.apiScript,
        env: runtime.apiEnv,
        restartCount: 0,
        failureStreak: 0,
      },
      pwa: {
        label: 'pwa',
        script: runtime.pwaScript,
        env: runtime.pwaEnv,
        restartCount: 0,
        failureStreak: 0,
      },
    };

    await runSupervisorLoop(runtime, state, services);

    state.status = 'stopped';
    state.lastEvent = 'Daemon supervisor stopped cleanly.';
    persistDaemonState(state);
  } catch (error) {
    state.status = 'crashed';
    state.lastEvent =
      error instanceof Error
        ? `Daemon supervisor crashed: ${error.message}`
        : 'Daemon supervisor crashed.';
    persistDaemonState(state);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : String(error),
      500,
    );
  } finally {
    removeDaemonPidFile();
  }
};

export const runWebCommand = async (options: WebCommandOptions, json: boolean): Promise<void> => {
  validateControlOptions(options);

  if (options.status) {
    const status = readWebDaemonStatus();

    if (json) {
      console.log(
        JSON.stringify(
          ok({
            command: 'web',
            lifecycle: 'daemon',
            daemon: status,
          }),
          null,
          2,
        ),
      );
      return;
    }

    if (!status.running) {
      console.log('Web daemon is not running.');
      console.log(`State file: ${status.stateFile}`);
      console.log(`Log file: ${status.logFile}`);
      return;
    }

    console.log(`Web daemon is running (pid ${status.pid}).`);
    console.log(`State file: ${status.stateFile}`);
    console.log(`Log file: ${status.logFile}`);
    if (status.state?.access?.tailnet?.pwaUrl) {
      console.log(`PWA tailnet: ${status.state.access.tailnet.pwaUrl}`);
    }
    if (status.state?.access?.warning) {
      console.warn(`Warning: ${status.state.access.warning}`);
    }
    return;
  }

  if (options.stop) {
    const result = await stopWebDaemon();

    if (json) {
      console.log(
        JSON.stringify(
          ok({
            command: 'web',
            lifecycle: 'daemon',
            daemon: {
              stopRequested: true,
              wasRunning: result.wasRunning,
              stopped: result.stopped,
              pid: result.pid,
              timedOut: result.timedOut ?? false,
              permissionDenied: result.permissionDenied ?? false,
            },
          }),
          null,
          2,
        ),
      );
      return;
    }

    if (!result.wasRunning) {
      console.log('Web daemon was not running.');
      return;
    }

    if (result.stopped) {
      console.log(`Stopped web daemon (pid ${result.pid}).`);
      return;
    }

    if (result.permissionDenied) {
      console.log(`Permission denied while stopping web daemon (pid ${result.pid}).`);
      return;
    }

    console.log(`Timed out while stopping web daemon (pid ${result.pid}).`);
    return;
  }

  const runtime = resolveWebRuntime({
    mode: options.mode,
    apiPort: options.apiPort,
    pwaPort: options.pwaPort,
  });

  if (options.daemon) {
    await startWebDaemon(runtime, json);
    return;
  }

  if (runtime.mode === 'preview') {
    await runBuild('api', runtime.apiEnv);
    await runBuild('pwa', runtime.pwaEnv);
  }

  const access = resolveWebAccessInfo(runtime.resolvedApiPort, runtime.resolvedPwaPort);

  if (json) {
    console.log(
      JSON.stringify(
        ok({
          command: 'web',
          mode: runtime.mode,
          lifecycle: 'foreground',
          services: {
            api: {
              package: '@tithe/api',
              script: runtime.apiScript,
              port: runtime.resolvedApiPort,
              baseUrl: runtime.resolvedApiBase,
            },
            pwa: {
              package: '@tithe/pwa',
              script: runtime.pwaScript,
              port: runtime.resolvedPwaPort,
            },
          },
          access,
          warnings: access.warning ? [access.warning] : [],
        }),
        null,
        2,
      ),
    );
  } else {
    console.log(`Starting web stack in ${runtime.mode} mode (foreground).`);
    console.log(`PWA local: ${access.local.pwaUrl}`);
    if (access.tailnet.pwaUrl) {
      console.log(`PWA tailnet: ${access.tailnet.pwaUrl}`);
    }
    if (access.warning) {
      console.warn(`Warning: ${access.warning}`);
    }
  }

  const processes: ManagedProcess[] = [
    startManagedProcess('api', runtime.apiScript, runtime.apiEnv),
    startManagedProcess('pwa', runtime.pwaScript, runtime.pwaEnv),
  ];

  await runServices(processes);
};
