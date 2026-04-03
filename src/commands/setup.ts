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

async function setupSkill(
  recipe: SkillRecipe,
  secrets: Record<string, string>,
  account: string,
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
  if (skillContent) {
    const skillDir = resolve(projectDir, '.claude', 'skills', recipe.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(resolve(skillDir, 'SKILL.md'), skillContent, 'utf-8');
    console.log(`Installed skill to .claude/skills/${recipe.name}/SKILL.md`);

    const variables = await getVariablesForAccount(recipe.service, account);
    const variableEntries = Object.entries(variables);

    if (variableEntries.length > 0 || (recipe.secrets ?? []).length > 0) {
      const contextLines: string[] = [
        '## Project Configuration\n',
        `Account: ${account}\n`,
      ];

      if (variableEntries.length > 0) {
        contextLines.push('\n### Variables\n');
        for (const [name, value] of variableEntries) {
          contextLines.push(`- ${name}: ${value}`);
        }
      }

      if ((recipe.secrets ?? []).length > 0) {
        contextLines.push('\n### Secrets\n');
        contextLines.push(
          'Secrets are available as environment variables in `.env`:'
        );
        for (const secret of recipe.secrets ?? []) {
          if (secret.envVar) {
            contextLines.push(`- \`${secret.envVar}\` ← ${secret.name}`);
          }
        }
      }

      await writeFile(
        resolve(skillDir, 'context.md'),
        contextLines.join('\n') + '\n',
        'utf-8'
      );
      console.log(
        `Generated context at .claude/skills/${recipe.name}/context.md`
      );
    }
  } else {
    console.warn(
      `No SKILL.md found for recipe "${recipe.name}". Create one at ~/.config/plugga/recipes/${recipe.name}/SKILL.md`
    );
  }

  const secretsWithEnvVars = (recipe.secrets ?? []).filter((s) => s.envVar);
  if (secretsWithEnvVars.length > 0) {
    const envPath = resolve(projectDir, '.env');
    let existing = '';

    try {
      existing = await readFile(envPath, 'utf-8');
    } catch {
      // file doesn't exist yet
    }

    const env = parse(existing);

    for (const secret of secretsWithEnvVars) {
      const value = secrets[secret.name];
      if (value !== undefined && secret.envVar) {
        env[secret.envVar] = value;
      }
    }

    await writeFile(envPath, stringifyEnv(env), 'utf-8');
    console.log('Wrote secrets to .env');
  }
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
    const account = await resolveAccount(input.recipe, input.account);
    const recipe = await loadRecipe(input.recipe);
    const secrets = await resolveSecrets(recipe, account, store);

    if (recipe.type === 'mcp') {
      await setupMcp(recipe, secrets, input.projectDir);
    } else if (recipe.type === 'skill') {
      await setupSkill(recipe, secrets, account, input.projectDir);
    }

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
