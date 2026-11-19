import type { SecretsStore } from '~/secrets/types';

import { loadVariables } from './variables';

async function listKnownAccounts(
  service: string,
  store: SecretsStore
): Promise<string[]> {
  const [secretAccounts, variables] = await Promise.all([
    store.listAccounts(service),
    loadVariables(),
  ]);
  const variableAccounts = Object.keys(variables[service] ?? {});
  return [...new Set([...secretAccounts, ...variableAccounts])].sort();
}

async function resolveAccount(
  service: string,
  explicitAccount: string | undefined,
  store: SecretsStore
): Promise<string> {
  if (explicitAccount) {
    return explicitAccount;
  }

  const accounts = await listKnownAccounts(service, store);
  const [onlyAccount] = accounts;
  if (accounts.length === 1 && onlyAccount) {
    return onlyAccount;
  }

  if (accounts.length === 0) {
    throw new Error(
      `No accounts found for "${service}". Create one with "plugga secrets set --service ${service} --account <account> ...".`
    );
  }

  throw new Error(
    `"${service}" has multiple accounts (${accounts.join(', ')}). Use --account to pick one.`
  );
}

export { listKnownAccounts, resolveAccount };
