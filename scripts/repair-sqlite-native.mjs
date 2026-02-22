import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dbPackageJsonPath = path.join(repoRoot, 'packages', 'db', 'package.json');
const dbRequire = createRequire(dbPackageJsonPath);

let betterSqlitePackageJsonPath;
try {
  betterSqlitePackageJsonPath = dbRequire.resolve('better-sqlite3/package.json');
} catch (error) {
  console.error('Could not resolve better-sqlite3 from packages/db.');
  console.error('Run `pnpm install` first, then retry `pnpm repair:sqlite`.');
  process.exit(1);
}

const betterSqliteDir = path.dirname(betterSqlitePackageJsonPath);
const cacheRoot = path.join(repoRoot, '.cache', 'sqlite-repair');
const npmCacheDir = path.join(cacheRoot, 'npm-cache');
const nodeGypDevDir = path.join(cacheRoot, 'node-gyp');

fs.mkdirSync(npmCacheDir, { recursive: true });
fs.mkdirSync(nodeGypDevDir, { recursive: true });

console.log(`Repairing better-sqlite3 native binding in ${betterSqliteDir}`);

const result = spawnSync(npmCommand, ['run', 'install'], {
  cwd: betterSqliteDir,
  env: {
    ...process.env,
    npm_config_cache: npmCacheDir,
    npm_config_devdir: nodeGypDevDir,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
