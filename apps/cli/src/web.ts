import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { ok } from '@tithe/contracts';
import { AppError } from '@tithe/domain';

const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

type WebMode = 'dev' | 'preview';

interface WebCommandOptions {
  mode?: string;
  apiPort?: string;
  pwaPort?: string;
}

interface ManagedProcess {
  label: 'api' | 'pwa';
  child: ChildProcess;
  flushLogs: () => void;
}

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
  const mode = value ?? 'dev';
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
  label: 'api' | 'pwa',
  script: 'dev' | 'start' | 'build',
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

const runBuild = async (label: 'api' | 'pwa', env: NodeJS.ProcessEnv): Promise<void> => {
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

export const runWebCommand = async (options: WebCommandOptions, json: boolean): Promise<void> => {
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

  const pwaEnv: NodeJS.ProcessEnv = { ...process.env };
  const pwaPortFallback = mode === 'dev' ? 5173 : 4173;
  if (pwaPort !== undefined) {
    if (mode === 'dev') {
      pwaEnv.PWA_PORT = String(pwaPort);
    } else {
      pwaEnv.PWA_PREVIEW_PORT = String(pwaPort);
    }
  }

  const fallbackApiBase = `http://${resolvedApiHost}:${resolvedApiPort}/v1`;
  const resolvedApiBase =
    apiPort !== undefined
      ? (rewriteApiBasePort(pwaEnv.VITE_API_BASE, resolvedApiPort) ?? fallbackApiBase)
      : (pwaEnv.VITE_API_BASE ?? fallbackApiBase);
  pwaEnv.VITE_API_BASE = resolvedApiBase;

  if (mode === 'preview') {
    await runBuild('api', apiEnv);
    await runBuild('pwa', pwaEnv);
  }

  if (json) {
    console.log(
      JSON.stringify(
        ok({
          command: 'web',
          mode,
          lifecycle: 'foreground',
          services: {
            api: {
              package: '@tithe/api',
              script: apiScript,
              port: resolvedApiPort,
              baseUrl: resolvedApiBase,
            },
            pwa: {
              package: '@tithe/pwa',
              script: pwaScript,
              port:
                mode === 'dev'
                  ? toPortOrFallback(pwaEnv.PWA_PORT, pwaPortFallback)
                  : toPortOrFallback(pwaEnv.PWA_PREVIEW_PORT, pwaPortFallback),
            },
          },
        }),
        null,
        2,
      ),
    );
  } else {
    console.log(`Starting web stack in ${mode} mode (foreground).`);
  }

  const processes: ManagedProcess[] = [
    startManagedProcess('api', apiScript, apiEnv),
    startManagedProcess('pwa', pwaScript, pwaEnv),
  ];

  await runServices(processes);
};
