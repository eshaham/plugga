import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureConfigDirs, getConfigDir } from './paths';

type VariablesConfig = Record<string, Record<string, Record<string, string>>>;

function getVariablesFilePath(): string {
  return join(getConfigDir(), 'variables.json');
}

async function loadVariables(): Promise<VariablesConfig> {
  try {
    const content = await readFile(getVariablesFilePath(), 'utf-8');
    return JSON.parse(content) as VariablesConfig;
  } catch {
    return {};
  }
}

async function saveVariables(config: VariablesConfig): Promise<void> {
  await ensureConfigDirs();
  await writeFile(
    getVariablesFilePath(),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8'
  );
}

async function getVariable(
  service: string,
  account: string,
  name: string
): Promise<string | undefined> {
  const config = await loadVariables();
  return config[service]?.[account]?.[name];
}

async function setVariable(
  service: string,
  account: string,
  name: string,
  value: string
): Promise<void> {
  const config = await loadVariables();
  if (!config[service]) {
    config[service] = {};
  }
  const serviceConfig = config[service];
  if (serviceConfig && !serviceConfig[account]) {
    serviceConfig[account] = {};
  }
  const accountConfig = serviceConfig?.[account];
  if (accountConfig) {
    accountConfig[name] = value;
  }
  await saveVariables(config);
}

async function getVariablesForAccount(
  service: string,
  account: string
): Promise<Record<string, string>> {
  const config = await loadVariables();
  return config[service]?.[account] ?? {};
}

export { getVariable, getVariablesForAccount, loadVariables, setVariable };
