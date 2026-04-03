import {
  getDefaultAccount,
  loadAccountsConfig,
  saveAccountsConfig,
  setDefaultAccount,
} from '~/config/accounts';
import { logInfo } from '~/logging/logger';

interface AccountsSetDefaultInput {
  service: string;
  account: string;
}

interface AccountsRenameInput {
  service: string;
  oldName: string;
  newName: string;
}

async function handleAccountsSetDefault(
  input: AccountsSetDefaultInput
): Promise<void> {
  await setDefaultAccount(input.service, input.account);
  console.log(
    `Default account for "${input.service}" set to "${input.account}"`
  );
  await logInfo('accounts.set-default', {
    service: input.service,
    account: input.account,
  });
}

async function handleAccountsRename(input: AccountsRenameInput): Promise<void> {
  const config = await loadAccountsConfig();
  const currentDefault = config.defaults[input.service];

  if (currentDefault === input.oldName) {
    config.defaults[input.service] = input.newName;
    await saveAccountsConfig(config);
  }

  console.log(
    `Renamed account "${input.oldName}" to "${input.newName}" for "${input.service}"`
  );
  console.log(
    'Note: You will need to re-set secrets for the new account name in your secrets store.'
  );
  await logInfo('accounts.rename', {
    service: input.service,
    oldName: input.oldName,
    newName: input.newName,
  });
}

async function handleAccountsShow(service: string): Promise<void> {
  const defaultAccount = await getDefaultAccount(service);
  if (defaultAccount) {
    console.log(`Default account for "${service}": ${defaultAccount}`);
  } else {
    console.log(`No default account set for "${service}"`);
  }
}

export { handleAccountsRename, handleAccountsSetDefault, handleAccountsShow };
export type { AccountsRenameInput, AccountsSetDefaultInput };
