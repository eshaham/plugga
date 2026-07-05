import { renameMcpEntry } from '~/config/claude-json';
import { loadProjectsRegistry } from '~/config/projects-registry';
import { logInfo } from '~/logging/logger';
import { errorMessage, printJson, printJsonError } from '~/output';
import { loadRecipe } from '~/recipes/recipe-loader';
import type { SecretsStore } from '~/secrets/types';

import {
  getRecipeAccounts,
  loadProjectState,
  saveProjectState,
} from './project-state';

interface AccountsRenameInput {
  service: string;
  oldName: string;
  newName: string;
}

async function renameAccountAcrossProjects(
  service: string,
  oldName: string,
  newName: string
): Promise<void> {
  const registry = await loadProjectsRegistry();
  for (const [projectDir, recipeNames] of Object.entries(registry)) {
    const state = await loadProjectState(projectDir);
    let stateChanged = false;

    for (const recipeName of recipeNames) {
      let recipe: Awaited<ReturnType<typeof loadRecipe>>;
      try {
        recipe = await loadRecipe(recipeName);
      } catch {
        continue;
      }
      if (recipe.service !== service) {
        continue;
      }

      const accounts = getRecipeAccounts(state, recipeName);
      if (!accounts.includes(oldName)) {
        continue;
      }

      if (recipe.type === 'mcp') {
        await renameMcpEntry(
          projectDir,
          `${recipe.name}-${oldName}`,
          `${recipe.name}-${newName}`
        );
      }

      const renamed = accounts.map((a) => (a === oldName ? newName : a));
      state.recipes[recipeName] = {
        accounts: renamed.filter((a, i, arr) => arr.indexOf(a) === i),
      };
      stateChanged = true;
    }

    if (stateChanged) {
      await saveProjectState(projectDir, state);
    }
  }
}

async function handleAccountsRename(input: AccountsRenameInput): Promise<void> {
  await renameAccountAcrossProjects(
    input.service,
    input.oldName,
    input.newName
  );

  console.log(
    `Renamed account "${input.oldName}" to "${input.newName}" for "${input.service}"`
  );
  console.log(
    'Note: 1Password secrets are stored under the old account name. Re-create them for the new name with "plugga secrets set", then re-run "plugga setup" for any skill recipes.'
  );
  await logInfo('accounts.rename', {
    service: input.service,
    oldName: input.oldName,
    newName: input.newName,
  });
}

async function handleAccountsList(
  service: string,
  store: SecretsStore,
  options: { json?: boolean } = {}
): Promise<void> {
  try {
    const accounts = await store.listAccounts(service);
    if (options.json) {
      printJson({
        service,
        accounts: accounts.map((account) => ({ name: account })),
      });
      return;
    }
    if (accounts.length === 0) {
      console.log(`No accounts found for service "${service}"`);
      return;
    }
    console.log(`Accounts for ${service}:`);
    for (const account of accounts) {
      console.log(`  ${account}`);
    }
  } catch (error) {
    const message = `Failed to list accounts: ${errorMessage(error)}`;
    if (options.json) {
      printJsonError(message);
    } else {
      console.error(message);
    }
  }
}

export { handleAccountsList, handleAccountsRename };
export type { AccountsRenameInput };
