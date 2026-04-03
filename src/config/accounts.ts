import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureConfigDirs, getConfigDir } from './paths';

interface AccountsConfig {
  defaults: Record<string, string>;
}

function getAccountsFilePath(): string {
  return join(getConfigDir(), 'accounts.json');
}

async function loadAccountsConfig(): Promise<AccountsConfig> {
  try {
    const content = await readFile(getAccountsFilePath(), 'utf-8');
    return JSON.parse(content) as AccountsConfig;
  } catch {
    return { defaults: {} };
  }
}

async function saveAccountsConfig(config: AccountsConfig): Promise<void> {
  await ensureConfigDirs();
  await writeFile(
    getAccountsFilePath(),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8'
  );
}

async function getDefaultAccount(service: string): Promise<string | undefined> {
  const config = await loadAccountsConfig();
  return config.defaults[service];
}

async function setDefaultAccount(
  service: string,
  account: string
): Promise<void> {
  const config = await loadAccountsConfig();
  config.defaults[service] = account;
  await saveAccountsConfig(config);
}

async function resolveAccount(
  service: string,
  explicitAccount: string | undefined
): Promise<string> {
  if (explicitAccount) {
    return explicitAccount;
  }

  const defaultAccount = await getDefaultAccount(service);
  if (defaultAccount) {
    return defaultAccount;
  }

  throw new Error(
    `No account specified and no default account set for "${service}". Use --account or set a default with "plugga accounts set-default ${service} <account>".`
  );
}

export {
  getDefaultAccount,
  loadAccountsConfig,
  resolveAccount,
  saveAccountsConfig,
  setDefaultAccount,
};
export type { AccountsConfig };
