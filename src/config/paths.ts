import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getConfigDir(): string {
  const xdgConfigHome = process.env['XDG_CONFIG_HOME'];
  const base = xdgConfigHome ?? join(homedir(), '.config');
  return join(base, 'plugga');
}

function getRecipesDir(): string {
  return join(getConfigDir(), 'recipes');
}

function getLogDir(): string {
  return join(getConfigDir(), 'logs');
}

async function ensureConfigDirs(): Promise<void> {
  await mkdir(getRecipesDir(), { recursive: true });
  await mkdir(getLogDir(), { recursive: true });
}

export { ensureConfigDirs, getConfigDir, getLogDir, getRecipesDir };
