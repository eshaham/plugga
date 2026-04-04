import { parse } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveAccount } from '~/config/accounts';
import { getVariablesForAccount } from '~/config/variables';
import { exec } from '~/exec/runner';
import { logError, logInfo } from '~/logging/logger';
import { loadRecipe, loadSkillContent } from '~/recipes/recipe-loader';
import type { McpRecipe, Recipe, SkillRecipe } from '~/recipes/types';
import type { SecretsStore } from '~/secrets/types';

import {
  addRecipeAccount,
  getRecipeAccounts,
  loadProjectState,
  saveProjectState,
} from './project-state';

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

function stringifyEnv(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
}

function suffixEnvVar(envVar: string, account: string): string {
  return `${envVar}_${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

async function setupMcp(
  recipe: McpRecipe,
  secrets: Record<string, string>,
  account: string,
  existingAccounts: string[],
  projectDir: string
): Promise<void> {
  const settingsPath = resolve(projectDir, '.claude', 'settings.local.json');
  const settings = await readJsonFile(settingsPath);
  const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};

  const isMultiAccount = existingAccounts.length > 0;
  const { mcp } = recipe;

  if (isMultiAccount && existingAccounts.length === 1) {
    const firstAccount = existingAccounts[0] ?? '';
    const existingEntry = mcpServers[recipe.name];
    if (existingEntry) {
      mcpServers[`${recipe.name}-${firstAccount}`] = existingEntry;
      delete mcpServers[recipe.name];
      console.log(
        `Renamed existing MCP server "${recipe.name}" to "${recipe.name}-${firstAccount}"`
      );
    }
  }

  const serverName = isMultiAccount ? `${recipe.name}-${account}` : recipe.name;

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

    mcpServers[serverName] = {
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

    mcpServers[serverName] = {
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

    mcpServers[serverName] = {
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
    `Configured MCP server "${serverName}" in .claude/settings.local.json`
  );
}

async function setupSkill(
  recipe: SkillRecipe,
  secrets: Record<string, string>,
  account: string,
  existingAccounts: string[],
  projectDir: string
): Promise<void> {
  if (recipe.cli) {
    const result = await exec('which', [recipe.cli.command]);
    if (result.exitCode !== 0) {
      console.warn(`CLI "${recipe.cli.command}" is not installed.`);
      if (recipe.cli.install) {
        console.log(`Install: ${recipe.cli.install}`);
      }
      if (recipe.cli.source) {
        console.log(`Source: ${recipe.cli.source}`);
      }
    } else {
      console.log(
        `CLI "${recipe.cli.command}" is available at ${result.stdout}`
      );
    }
  }

  const skillContent = await loadSkillContent(recipe.name);
  if (!skillContent) {
    throw new Error(
      `SKILL.md is required for skill recipe "${recipe.name}". Create it at ~/.config/plugga/recipes/${recipe.name}/SKILL.md`
    );
  }

  const skillDir = resolve(projectDir, '.claude', 'skills', recipe.name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(resolve(skillDir, 'SKILL.md'), skillContent, 'utf-8');
  console.log(`Installed skill to .claude/skills/${recipe.name}/SKILL.md`);

  const allAccounts = [...existingAccounts, account].filter(
    (a, i, arr) => arr.indexOf(a) === i
  );
  await generateContextFile(recipe, allAccounts, skillDir);

  const secretsWithEnvVars = (recipe.secrets ?? []).filter((s) => s.envVar);
  if (secretsWithEnvVars.length > 0) {
    const allAccounts = [...existingAccounts, account].filter(
      (a, i, arr) => arr.indexOf(a) === i
    );
    const isMultiAccount = allAccounts.length > 1;

    const envPath = resolve(projectDir, '.env');
    let existing = '';

    try {
      existing = await readFile(envPath, 'utf-8');
    } catch {
      // file doesn't exist yet
    }

    const env = parse(existing);

    if (isMultiAccount && existingAccounts.length === 1) {
      const firstAccount = existingAccounts[0] ?? '';
      for (const secret of secretsWithEnvVars) {
        if (secret.envVar && env[secret.envVar] !== undefined) {
          env[suffixEnvVar(secret.envVar, firstAccount)] =
            env[secret.envVar] ?? '';
          delete env[secret.envVar];
        }
      }
      console.log(
        `Renamed existing env vars with "${firstAccount}" suffix for multi-account`
      );
    }

    for (const secret of secretsWithEnvVars) {
      const value = secrets[secret.name];
      if (value !== undefined && secret.envVar) {
        if (isMultiAccount) {
          env[suffixEnvVar(secret.envVar, account)] = value;
        } else {
          env[secret.envVar] = value;
        }
      }
    }

    await writeFile(envPath, stringifyEnv(env), 'utf-8');
    console.log('Wrote secrets to .env');
  }
}

async function generateContextFile(
  recipe: SkillRecipe,
  accounts: string[],
  skillDir: string
): Promise<void> {
  const isMultiAccount = accounts.length > 1;
  const contextLines: string[] = ['## Project Configuration\n'];

  if (isMultiAccount) {
    contextLines.push(`Accounts: ${accounts.join(', ')}\n`);
  } else {
    contextLines.push(`Account: ${accounts[0]}\n`);
  }

  for (const account of accounts) {
    if (isMultiAccount) {
      contextLines.push(`\n### Account: ${account}\n`);
    }

    const variables = await getVariablesForAccount(recipe.service, account);
    const variableEntries = Object.entries(variables);

    if (variableEntries.length > 0) {
      contextLines.push(
        isMultiAccount ? '\n#### Variables\n' : '\n### Variables\n'
      );
      for (const [name, value] of variableEntries) {
        contextLines.push(`- ${name}: ${value}`);
      }
    }

    if ((recipe.secrets ?? []).length > 0) {
      contextLines.push(
        isMultiAccount ? '\n#### Secrets\n' : '\n### Secrets\n'
      );
      contextLines.push(
        'Secrets are available as environment variables in `.env`:'
      );
      for (const secret of recipe.secrets ?? []) {
        if (secret.envVar) {
          const envVarName = isMultiAccount
            ? suffixEnvVar(secret.envVar, account)
            : secret.envVar;
          contextLines.push(`- \`${envVarName}\` \u2190 ${secret.name}`);
        }
      }
    }
  }

  await writeFile(
    resolve(skillDir, 'context.md'),
    contextLines.join('\n') + '\n',
    'utf-8'
  );
  console.log(`Generated context at .claude/skills/${recipe.name}/context.md`);
}

async function checkGitignore(projectDir: string): Promise<void> {
  const gitignorePath = resolve(projectDir, '.gitignore');
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    if (!content.includes('.env')) {
      console.warn(
        'Warning: .env is not in .gitignore. Consider adding it to avoid committing secrets.'
      );
    }
  } catch {
    console.warn(
      'Warning: No .gitignore found. Consider creating one with .env to avoid committing secrets.'
    );
  }
}

async function handleSetup(
  input: SetupInput,
  store: SecretsStore
): Promise<void> {
  try {
    const recipe = await loadRecipe(input.recipe);
    const account = await resolveAccount(recipe.service, input.account);
    const secrets = await resolveSecrets(recipe, account, store);

    const state = await loadProjectState(input.projectDir);
    const existingAccounts = getRecipeAccounts(state, input.recipe);

    if (existingAccounts.includes(account)) {
      console.log(
        `Re-running setup for ${input.recipe}/${account} (updating existing configuration)`
      );
    }

    if (recipe.type === 'mcp') {
      await setupMcp(
        recipe,
        secrets,
        account,
        existingAccounts,
        input.projectDir
      );
    } else if (recipe.type === 'skill') {
      await setupSkill(
        recipe,
        secrets,
        account,
        existingAccounts,
        input.projectDir
      );
    }

    const updatedState = addRecipeAccount(state, input.recipe, account);
    await saveProjectState(input.projectDir, updatedState);

    const hasEnvSecrets = (recipe.secrets ?? []).some((s) => s.envVar);
    if (hasEnvSecrets && recipe.type === 'skill') {
      await checkGitignore(input.projectDir);
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
