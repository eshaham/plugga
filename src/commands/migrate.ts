import { copyFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getClaudeJsonPath,
  readClaudeJson,
  writeClaudeJson,
} from '~/config/claude-json';
import { getConfigDir } from '~/config/paths';
import { loadProjectsRegistry } from '~/config/projects-registry';
import { logInfo } from '~/logging/logger';
import { loadRecipe } from '~/recipes/recipe-loader';
import type { Recipe } from '~/recipes/types';

import { getRecipeAccounts, loadProjectState } from './project-state';

interface McpRename {
  projectDir: string;
  from: string;
  to: string;
}

interface MigrationResult {
  removedDefaults: Record<string, string>;
  accountsBackup?: string;
  claudeJsonBackup?: string;
  renamed: McpRename[];
  skipped: string[];
}

function getLegacyAccountsPath(): string {
  return join(getConfigDir(), 'accounts.json');
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function loadLegacyDefaults(): Promise<Record<string, string> | null> {
  let content: string;
  try {
    content = await readFile(getLegacyAccountsPath(), 'utf-8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(content) as { defaults?: Record<string, string> };
  return parsed.defaults ?? {};
}

function pickAccount(
  accounts: string[],
  defaultAccount: string | undefined
): string | undefined {
  if (defaultAccount && accounts.includes(defaultAccount)) {
    return defaultAccount;
  }
  return accounts.length === 1 ? accounts[0] : undefined;
}

async function loadRecipeOrNull(name: string): Promise<Recipe | null> {
  try {
    return await loadRecipe(name);
  } catch (error) {
    console.warn(
      `Skipping recipe "${name}": ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function migrateMcpNames(
  defaults: Record<string, string>,
  result: MigrationResult
): Promise<void> {
  const claudeJson = await readClaudeJson();
  const projects = (claudeJson['projects'] as Record<string, unknown>) ?? {};
  const registry = await loadProjectsRegistry();
  const recipeCache = new Map<string, Recipe | null>();

  for (const projectDir of Object.keys(registry)) {
    const projectEntry = projects[projectDir] as
      | Record<string, unknown>
      | undefined;
    const mcpServers = projectEntry?.['mcpServers'] as
      | Record<string, unknown>
      | undefined;
    if (!mcpServers) {
      continue;
    }

    const state = await loadProjectState(projectDir);
    for (const recipeName of Object.keys(state.recipes)) {
      if (!(recipeName in mcpServers)) {
        continue;
      }
      if (!recipeCache.has(recipeName)) {
        recipeCache.set(recipeName, await loadRecipeOrNull(recipeName));
      }
      const recipe = recipeCache.get(recipeName);
      if (recipe?.type !== 'mcp') {
        continue;
      }

      const accounts = getRecipeAccounts(state, recipeName);
      const account = pickAccount(accounts, defaults[recipe.service]);
      if (!account) {
        result.skipped.push(
          `${projectDir}: "${recipeName}" has no single matching account (${accounts.join(', ') || 'none'})`
        );
        continue;
      }

      const target = `${recipeName}-${account}`;
      if (target in mcpServers) {
        result.skipped.push(
          `${projectDir}: "${recipeName}" not renamed, "${target}" already exists`
        );
        continue;
      }

      mcpServers[target] = mcpServers[recipeName];
      delete mcpServers[recipeName];
      result.renamed.push({ projectDir, from: recipeName, to: target });
    }
  }

  if (result.renamed.length > 0) {
    const backup = `${getClaudeJsonPath()}.bak-plugga-${timestamp()}`;
    await copyFile(getClaudeJsonPath(), backup);
    result.claudeJsonBackup = backup;
    await writeClaudeJson(claudeJson);
  }
}

async function runMigration(): Promise<MigrationResult> {
  const result: MigrationResult = {
    removedDefaults: {},
    renamed: [],
    skipped: [],
  };

  const defaults = await loadLegacyDefaults();
  await migrateMcpNames(defaults ?? {}, result);

  if (defaults !== null) {
    const backup = `${getLegacyAccountsPath()}.bak-${timestamp()}`;
    await rename(getLegacyAccountsPath(), backup);
    result.accountsBackup = backup;
    result.removedDefaults = defaults;
  }

  return result;
}

async function handleMigrate(): Promise<void> {
  try {
    const result = await runMigration();

    for (const { projectDir, from, to } of result.renamed) {
      console.log(`Renamed MCP server "${from}" -> "${to}" in ${projectDir}`);
    }
    for (const message of result.skipped) {
      console.warn(`Skipped: ${message}`);
    }
    if (result.claudeJsonBackup) {
      console.log(`Backed up ~/.claude.json to ${result.claudeJsonBackup}`);
    }
    if (result.accountsBackup) {
      const services = Object.keys(result.removedDefaults);
      console.log(
        `Removed legacy default accounts${services.length > 0 ? ` (${services.join(', ')})` : ''}; moved accounts.json to ${result.accountsBackup}`
      );
    }
    if (
      result.renamed.length === 0 &&
      result.skipped.length === 0 &&
      !result.accountsBackup
    ) {
      console.log('Nothing to migrate.');
    }

    await logInfo('migrate', {
      renamed: result.renamed.length,
      skipped: result.skipped.length,
      removedDefaults: Object.keys(result.removedDefaults).length,
    });
  } catch (error) {
    console.error(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

export { handleMigrate, runMigration };
export type { MigrationResult };
