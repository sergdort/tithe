import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const run = (args, label) => {
  console.log(`\n==> ${label}`);
  const result = spawnSync(pnpmCommand, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  return result.status ?? 1;
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  console.warn(
    `Warning: expected Node 22.x for native SQLite stability, but found ${process.version}.`,
  );
}

const envPath = path.join(repoRoot, '.env');
const envExamplePath = path.join(repoRoot, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('Created .env from .env.example');
}

const installStatus = run(['install'], 'Installing workspace dependencies');
if (installStatus !== 0) {
  process.exit(installStatus);
}

const sqliteCheckStatus = run(['check:sqlite'], 'Checking better-sqlite3 native binding');
if (sqliteCheckStatus !== 0) {
  console.log('\nNative SQLite check failed. Attempting automatic repair...');
  const repairStatus = run(['repair:sqlite'], 'Repairing better-sqlite3 native binding');
  if (repairStatus !== 0) {
    process.exit(repairStatus);
  }
}

console.log('\nFirst-time setup complete.');
console.log('Next steps: pnpm db:migrate && pnpm dev');
