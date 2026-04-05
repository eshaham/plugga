import {
  getDefaultAccount,
  loadAccountsConfig,
  saveAccountsConfig,
  setDefaultAccount,
  unsetDefaultAccount,
} from '~/config/accounts';
import { renameMcpEntry } from '~/config/claude-json';
import { loadProjectsRegistry } from '~/config/projects-registry';
import { logInfo } from '~/logging/logger';
import { loadRecipe } from '~/recipes/recipe-loader';

import { getRecipeAccounts, loadProjectState } from './project-state';

interface AccountsSetDefaultInput {
  service: string;
  account: string;
}

interface AccountsRenameInput {
  service: string;
  oldName: string;
  newName: string;
}

async function renameMcpEntriesAcrossProjects(
  service: string,
  oldDefault: string | undefined,
  newDefault: string | undefined
): Promise<void> {
  const registry = await loadProjectsRegistry();
  for (const [projectDir, recipeNames] of Object.entries(registry)) {
    const state = await loadProjectState(projectDir);
    for (const recipeName of recipeNames) {
      let recipe: Awaited<ReturnType<typeof loadRecipe>>;
      try {
        recipe = await loadRecipe(recipeName);
      } catch {
        continue;
      }
      if (recipe.service !== service || recipe.type !== 'mcp') {
        continue;
      }

      const accounts = getRecipeAccounts(state, recipeName);

      if (oldDefault && accounts.includes(oldDefault)) {
        await renameMcpEntry(
          projectDir,
          recipe.name,
          `${recipe.name}-${oldDefault}`
        );
      }

      if (newDefault && accounts.includes(newDefault)) {
        await renameMcpEntry(
          projectDir,
          `${recipe.name}-${newDefault}`,
          recipe.name
        );
      }
    }
  }
}

async function handleAccountsSetDefault(
  input: AccountsSetDefaultInput
): Promise<void> {
  const oldDefault = await getDefaultAccount(input.service);
  await setDefaultAccount(input.service, input.account);
  await renameMcpEntriesAcrossProjects(
    input.service,
    oldDefault,
    input.account
  );
  console.log(
    `Default account for "${input.service}" set to "${input.account}"`
  );
  await logInfo('accounts.set-default', {
    service: input.service,
    account: input.account,
  });
}

async function handleAccountsUnsetDefault(service: string): Promise<void> {
  const oldDefault = await getDefaultAccount(service);
  if (!oldDefault) {
    console.log(`No default account set for "${service}"`);
    return;
  }
  await unsetDefaultAccount(service);
  await renameMcpEntriesAcrossProjects(service, oldDefault, undefined);
  console.log(`Default account for "${service}" unset (was "${oldDefault}")`);
  await logInfo('accounts.unset-default', { service, oldDefault });
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

export {
  handleAccountsRename,
  handleAccountsSetDefault,
  handleAccountsShow,
  handleAccountsUnsetDefault,
};
export type { AccountsRenameInput, AccountsSetDefaultInput };
