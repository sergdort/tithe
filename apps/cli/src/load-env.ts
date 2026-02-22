import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = path.join(workspaceRoot, '.env');

export const loadWorkspaceEnv = (): void => {
  dotenv.config({
    path: envPath,
    override: false,
    quiet: true,
  });
};
