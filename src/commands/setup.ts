import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  getProjectMcpServers,
  readClaudeJson,
  setProjectMcpServers,
  writeClaudeJson,
} from '~/config/claude-json';
import { registerProject } from '~/config/projects-registry';
import { getVariablesForAccount } from '~/config/variables';
import { exec } from '~/exec/runner';
import {
  SETTINGS_LOCAL_INCLUDE_ENTRY,
  addSettingsLocalInclude,
  copyConfigToWorktree,
  getWorktreeInfo,
  hasSettingsLocalInclude,
} from '~/git/worktree';
import { logError, logInfo } from '~/logging/logger';
import { confirm } from '~/prompt/confirm';
import { loadRecipe, loadSkillContent } from '~/recipes/recipe-loader';
import type { McpRecipe, Recipe, SkillRecipe } from '~/recipes/types';
import type { SecretsStore } from '~/secrets/types';

import {
  getRecipeAccounts,
  loadProjectState,
  saveProjectState,
  setRecipeAccounts,
} from './project-state';

interface SetupInput {
  recipe: string;
  account?: string;
  projectDir: string;
  add?: boolean;
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

export function suffixEnvVar(envVar: string, account: string): string {
  return `${envVar}_${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

async function setupMcp(
  recipe: McpRecipe,
  secrets: Record<string, string>,
  account: string,
  projectDir: string
): Promise<void> {
  const claudeJson = await readClaudeJson();
  const projects = (claudeJson['projects'] as Record<string, unknown>) ?? {};
  const projectEntry =
    (projects[projectDir] as Record<string, unknown>) ?? null;

  if (!projectEntry) {
    throw new Error(
      `Project "${projectDir}" not found in ~/.claude.json. Open Claude Code in this directory first.`
    );
  }

  const mcpServers =
    (projectEntry['mcpServers'] as Record<string, unknown>) ?? {};

  const serverName = `${recipe.name}-${account}`;
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

  projectEntry['mcpServers'] = mcpServers;
  projects[projectDir] = projectEntry;
  claudeJson['projects'] = projects;
  await writeClaudeJson(claudeJson);

  console.log(`Configured MCP server "${serverName}" in ~/.claude.json`);
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
  const normalizedSkillContent = skillContent.replace(
    /available (?:as `[^`]+` )?in `\.env`\.?/g,
    'available as environment variables via `.claude/settings.local.json` `env` field.'
  );
  await writeFile(
    resolve(skillDir, 'SKILL.md'),
    normalizedSkillContent,
    'utf-8'
  );
  console.log(`Installed skill to .claude/skills/${recipe.name}/SKILL.md`);

  const allAccounts = [...existingAccounts, account].filter(
    (a, i, arr) => arr.indexOf(a) === i
  );
  await generateContextFile(recipe, allAccounts, skillDir);

  const secretsWithEnvVars = (recipe.secrets ?? []).filter((s) => s.envVar);
  if (secretsWithEnvVars.length > 0) {
    const isMultiAccount = allAccounts.length > 1;

    const settingsPath = resolve(projectDir, '.claude', 'settings.local.json');
    const settings = await readJsonFile(settingsPath);
    const env = (settings['env'] as Record<string, string>) ?? {};

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

    settings['env'] = env;
    await writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8'
    );
    console.log('Wrote secrets to .claude/settings.local.json env');
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
        'Secrets are available as environment variables via `.claude/settings.local.json` `env` field:'
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
  const result = await exec(
    'git',
    ['check-ignore', '-q', '.claude/settings.local.json'],
    { cwd: projectDir }
  );
  if (result.exitCode !== 0) {
    console.warn(
      'Warning: settings.local.json is not in .gitignore. Consider adding .claude/settings.local.json to avoid committing secrets.'
    );
  }
}

async function ensureWorktreeInclude(mainRoot: string): Promise<void> {
  if (await hasSettingsLocalInclude(mainRoot)) {
    return;
  }

  console.log(
    `Tip: ${SETTINGS_LOCAL_INCLUDE_ENTRY} is not in .worktreeinclude, so new worktrees won't receive your secrets automatically.`
  );
  const shouldAdd = await confirm(
    `Add ${SETTINGS_LOCAL_INCLUDE_ENTRY} to .worktreeinclude now?`
  );
  if (shouldAdd) {
    await addSettingsLocalInclude(mainRoot);
    console.log(`Added ${SETTINGS_LOCAL_INCLUDE_ENTRY} to .worktreeinclude`);
  } else {
    console.log(
      'Skipped. You can configure this later by running /setup-worktrees.'
    );
  }
}

async function removeMcpAccounts(
  recipe: McpRecipe,
  accounts: string[],
  projectDir: string
): Promise<void> {
  if (accounts.length === 0) {
    return;
  }
  const mcpServers = await getProjectMcpServers(projectDir);
  let changed = false;
  for (const account of accounts) {
    const serverName = `${recipe.name}-${account}`;
    if (serverName in mcpServers) {
      delete mcpServers[serverName];
      changed = true;
      console.log(`Removed MCP server "${serverName}" from ~/.claude.json`);
    }
  }
  if (changed) {
    await setProjectMcpServers(projectDir, mcpServers);
  }
}

async function removeSkillAccountsEnv(
  recipe: SkillRecipe,
  accounts: string[],
  projectDir: string
): Promise<void> {
  if (accounts.length === 0) {
    return;
  }
  const settingsPath = resolve(projectDir, '.claude', 'settings.local.json');
  const settings = await readJsonFile(settingsPath);
  const env = (settings['env'] as Record<string, string>) ?? {};
  let changed = false;
  for (const account of accounts) {
    for (const secret of recipe.secrets ?? []) {
      if (!secret.envVar) {
        continue;
      }
      for (const key of [secret.envVar, suffixEnvVar(secret.envVar, account)]) {
        if (env[key] !== undefined) {
          delete env[key];
          changed = true;
        }
      }
    }
  }
  if (changed) {
    settings['env'] = env;
    await writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n',
      'utf-8'
    );
    console.log(
      `Removed env vars for replaced account(s): ${accounts.join(', ')}`
    );
  }
}

async function handleSetup(
  input: SetupInput,
  store: SecretsStore
): Promise<void> {
  try {
    const recipe = await loadRecipe(input.recipe);
    const account = input.account;
    if (!account) {
      throw new Error('No account specified. Use --account.');
    }
    const secrets = await resolveSecrets(recipe, account, store);

    const worktree =
      recipe.type === 'skill' ? await getWorktreeInfo(input.projectDir) : null;
    const activeWorktree = worktree?.isWorktree ? worktree : null;
    const setupDir = activeWorktree?.mainRoot ?? input.projectDir;

    if (activeWorktree) {
      console.log(
        `Detected a git worktree. Setting up in the main repo (${activeWorktree.mainRoot}) and copying into the worktree.`
      );
    }

    const state = await loadProjectState(setupDir);
    const existingAccounts = getRecipeAccounts(state, input.recipe);
    const otherAccounts = existingAccounts.filter((a) => a !== account);
    const isAdd = input.add ?? false;
    const accountsToRemove = isAdd ? [] : otherAccounts;
    const remainingAccounts = isAdd ? otherAccounts : [];

    if (accountsToRemove.length > 0) {
      console.log(
        `Switching ${input.recipe} to account "${account}" (removing ${accountsToRemove.join(
          ', '
        )}). Use --add to keep multiple accounts.`
      );
    } else if (existingAccounts.includes(account)) {
      console.log(
        `Re-running setup for ${input.recipe}/${account} (updating existing configuration)`
      );
    }

    if (recipe.type === 'mcp') {
      await removeMcpAccounts(recipe, accountsToRemove, input.projectDir);
      await setupMcp(recipe, secrets, account, input.projectDir);
    } else if (recipe.type === 'skill') {
      await removeSkillAccountsEnv(recipe, accountsToRemove, setupDir);
      await setupSkill(recipe, secrets, account, remainingAccounts, setupDir);
    }

    const finalAccounts = isAdd ? [...existingAccounts, account] : [account];
    const updatedState = setRecipeAccounts(state, input.recipe, finalAccounts);
    await saveProjectState(setupDir, updatedState);
    await registerProject(setupDir, input.recipe);

    if (recipe.type === 'skill') {
      await checkGitignore(setupDir);
    }

    if (activeWorktree) {
      await copyConfigToWorktree(
        activeWorktree.mainRoot,
        activeWorktree.worktreeRoot,
        input.recipe
      );
      await ensureWorktreeInclude(activeWorktree.mainRoot);
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
