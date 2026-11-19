import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { Recipe } from '~/recipes/types';

import { cleanupTempDir, createTempDir } from './test-helpers';

const mockHomedir = jest.fn<() => string>();
const mockLoadRecipe = jest.fn<(name: string) => Promise<Recipe>>();
const mockLogInfo =
  jest.fn<
    (action: string, details?: Record<string, unknown>) => Promise<void>
  >();

jest.unstable_mockModule('node:os', () => ({
  homedir: mockHomedir,
}));

jest.unstable_mockModule('~/recipes/recipe-loader', () => ({
  loadRecipe: mockLoadRecipe,
}));

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
}));

const { runMigration } = await import('~/commands/migrate');

const recipes: Record<string, Recipe> = {
  linear: {
    name: 'linear',
    service: 'linear',
    description: 'Linear',
    type: 'mcp',
    mcp: { transport: 'http', url: 'https://example.com/linear' },
  },
  cloudflare: {
    name: 'cloudflare',
    service: 'cloudflare',
    description: 'Cloudflare',
    type: 'mcp',
    mcp: { transport: 'http', url: 'https://example.com/cf' },
  },
  gsc: {
    name: 'gsc',
    service: 'gsc',
    description: 'GSC',
    type: 'skill',
  },
};

let tempDir: string;
let homeDir: string;
let configDir: string;
let projectA: string;
let projectB: string;
const originalXdg = process.env['XDG_CONFIG_HOME'];

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

async function writeProjectState(
  projectDir: string,
  state: Record<string, string[]>
): Promise<void> {
  await mkdir(join(projectDir, '.claude'), { recursive: true });
  const recipesState = Object.fromEntries(
    Object.entries(state).map(([name, accounts]) => [name, { accounts }])
  );
  await writeJson(join(projectDir, '.claude', 'plugga.json'), {
    recipes: recipesState,
  });
}

function mcpNames(
  claudeJson: { projects: Record<string, { mcpServers: object }> },
  projectDir: string
): string[] {
  return Object.keys(claudeJson.projects[projectDir]?.mcpServers ?? {}).sort();
}

beforeEach(async () => {
  tempDir = await createTempDir();
  homeDir = resolve(tempDir, 'home');
  configDir = resolve(tempDir, 'config');
  projectA = resolve(tempDir, 'a');
  projectB = resolve(tempDir, 'b');
  await mkdir(homeDir, { recursive: true });
  await mkdir(join(configDir, 'plugga'), { recursive: true });
  process.env['XDG_CONFIG_HOME'] = configDir;
  mockHomedir.mockReturnValue(homeDir);
  mockLogInfo.mockResolvedValue(undefined);
  mockLoadRecipe.mockImplementation((name) => {
    const recipe = recipes[name];
    return recipe
      ? Promise.resolve(recipe)
      : Promise.reject(new Error(`Recipe "${name}" not found`));
  });
});

afterEach(async () => {
  if (originalXdg === undefined) {
    delete process.env['XDG_CONFIG_HOME'];
  } else {
    process.env['XDG_CONFIG_HOME'] = originalXdg;
  }
  await cleanupTempDir(tempDir);
});

describe('runMigration', () => {
  it('renames bare MCP entries and removes legacy defaults', async () => {
    await writeJson(join(configDir, 'plugga', 'accounts.json'), {
      defaults: { linear: 'personal', cloudflare: 'rawdash' },
    });
    await writeJson(join(configDir, 'plugga', 'projects.json'), {
      [projectA]: ['linear', 'cloudflare', 'gsc'],
      [projectB]: ['linear'],
    });
    await writeProjectState(projectA, {
      linear: ['personal'],
      cloudflare: ['personal', 'rawdash'],
      gsc: ['rawdash'],
    });
    await writeProjectState(projectB, { linear: ['work'] });
    await writeJson(join(homeDir, '.claude.json'), {
      projects: {
        [projectA]: {
          mcpServers: { linear: { url: 'l' }, cloudflare: {}, slack: {} },
        },
        [projectB]: { mcpServers: { linear: {} } },
      },
    });

    const result = await runMigration();

    const claudeJson = await readJson<{
      projects: Record<string, { mcpServers: Record<string, unknown> }>;
    }>(join(homeDir, '.claude.json'));
    expect(mcpNames(claudeJson, projectA)).toEqual([
      'cloudflare-rawdash',
      'linear-personal',
      'slack',
    ]);
    expect(
      claudeJson.projects[projectA]?.mcpServers['linear-personal']
    ).toEqual({ url: 'l' });
    expect(mcpNames(claudeJson, projectB)).toEqual(['linear-work']);
    expect(result.renamed).toHaveLength(3);
    expect(result.removedDefaults).toEqual({
      linear: 'personal',
      cloudflare: 'rawdash',
    });

    const configFiles = await readdir(join(configDir, 'plugga'));
    expect(configFiles).not.toContain('accounts.json');
    expect(configFiles.some((f) => f.startsWith('accounts.json.bak-'))).toBe(
      true
    );
    const homeFiles = await readdir(homeDir);
    expect(
      homeFiles.some((f) => f.startsWith('.claude.json.bak-plugga-'))
    ).toBe(true);
  });

  it('skips entries whose account is ambiguous or whose target exists', async () => {
    await writeJson(join(configDir, 'plugga', 'projects.json'), {
      [projectA]: ['cloudflare', 'linear'],
    });
    await writeProjectState(projectA, {
      cloudflare: ['personal', 'rawdash'],
      linear: ['personal'],
    });
    await writeJson(join(homeDir, '.claude.json'), {
      projects: {
        [projectA]: {
          mcpServers: { cloudflare: {}, linear: {}, 'linear-personal': {} },
        },
      },
    });

    const result = await runMigration();

    expect(result.renamed).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    const homeFiles = await readdir(homeDir);
    expect(homeFiles).toEqual(['.claude.json']);
  });

  it('is a no-op when already migrated', async () => {
    await writeJson(join(configDir, 'plugga', 'projects.json'), {
      [projectA]: ['linear'],
    });
    await writeProjectState(projectA, { linear: ['personal'] });
    await writeJson(join(homeDir, '.claude.json'), {
      projects: { [projectA]: { mcpServers: { 'linear-personal': {} } } },
    });

    const result = await runMigration();

    expect(result).toEqual({ removedDefaults: {}, renamed: [], skipped: [] });
  });
});
