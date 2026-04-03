import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveAccount } from '~/config/accounts';
import { logError, logInfo } from '~/logging/logger';
import { loadRecipe } from '~/recipes/recipe-loader';
import type { McpRecipe, Recipe } from '~/recipes/types';
import type { SecretsStore } from '~/secrets/types';

interface SetupInput {
  recipe: string;
  account?: string;
  projectDir: string;
}

async function resolveSecrets(
  recipe: Recipe,
  account: string,
  store: SecretsStore
): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};
  for (const secret of recipe.secrets ?? []) {
    const ref = { service: recipe.service, account, key: secret.name };
    try {
      const exists = await store.has(ref);
      if (exists) {
        secrets[secret.name] = await store.get(ref);
      } else {
        console.warn(
          `Warning: secret "${secret.name}" not set for ${recipe.service}/${account}`
        );
      }
    } catch {
      console.warn(
        `Warning: could not read secret "${secret.name}" for ${recipe.service}/${account}`
      );
    }
  }
  return secrets;
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function setupMcp(
  recipe: McpRecipe,
  secrets: Record<string, string>,
  projectDir: string
): Promise<void> {
  const settingsPath = resolve(projectDir, '.claude', 'settings.local.json');
  const settings = await readJsonFile(settingsPath);
  const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};

  const { mcp } = recipe;

  if (mcp.transport === 'stdio') {
    const envMapping: Record<string, string> = {};
    for (const secret of recipe.secrets ?? []) {
      if (secret.envVar) {
        const value = secrets[secret.name];
        if (value !== undefined) {
          envMapping[secret.envVar] = value;
        }
      }
    }

    mcpServers[recipe.name] = {
      command: mcp.command,
      args: mcp.args ?? [],
      env: envMapping,
    };
  } else if (mcp.transport === 'sse') {
    const headers: Record<string, string> = {};
    for (const secret of recipe.secrets ?? []) {
      if (secret.header) {
        const value = secrets[secret.name];
        if (value !== undefined) {
          headers[secret.header] = `${secret.headerPrefix ?? ''}${value}`;
        }
      }
    }

    mcpServers[recipe.name] = {
      url: mcp.url,
      headers,
    };
  } else if (mcp.transport === 'http') {
    const headers: Record<string, string> = { ...(mcp.headers ?? {}) };
    for (const secret of recipe.secrets ?? []) {
      if (secret.header) {
        const value = secrets[secret.name];
        if (value !== undefined) {
          headers[secret.header] = `${secret.headerPrefix ?? ''}${value}`;
        }
      }
    }

    mcpServers[recipe.name] = {
      type: 'http',
      url: mcp.url,
      headers,
    };
  }

  settings['mcpServers'] = mcpServers;

  const claudeDir = resolve(projectDir, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    settingsPath,
    JSON.stringify(settings, null, 2) + '\n',
    'utf-8'
  );

  console.log(
    `Configured MCP server "${recipe.name}" in .claude/settings.local.json`
  );
}

async function handleSetup(
  input: SetupInput,
  store: SecretsStore
): Promise<void> {
  try {
    const account = await resolveAccount(input.recipe, input.account);
    const recipe = await loadRecipe(input.recipe);
    const secrets = await resolveSecrets(recipe, account, store);

    if (recipe.type === 'mcp') {
      await setupMcp(recipe, secrets, input.projectDir);
    }

    console.log(`Setup complete for ${input.recipe}/${account}`);
    await logInfo('setup', {
      recipe: input.recipe,
      account,
      type: recipe.type,
    });
  } catch (error) {
    await logError('setup', error, { recipe: input.recipe });
    console.error(
      `Setup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export { handleSetup };
export type { SetupInput };
