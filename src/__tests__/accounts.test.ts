import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { McpRecipe } from '~/recipes/types';

import { cleanupTempDir, createTempDir } from './test-helpers';

const mockRenameMcpEntry =
  jest.fn<
    (projectDir: string, oldName: string, newName: string) => Promise<boolean>
  >();
const mockLoadProjectsRegistry =
  jest.fn<() => Promise<Record<string, string[]>>>();
const mockLoadProjectState =
  jest.fn<
    (
      projectDir: string
    ) => Promise<{ recipes: Record<string, { accounts: string[] }> }>
  >();
const mockLoadRecipe = jest.fn<(name: string) => Promise<McpRecipe>>();
const mockLogInfo =
  jest.fn<
    (action: string, details?: Record<string, unknown>) => Promise<void>
  >();

jest.unstable_mockModule('~/config/claude-json', () => ({
  renameMcpEntry: mockRenameMcpEntry,
}));

jest.unstable_mockModule('~/config/projects-registry', () => ({
  loadProjectsRegistry: mockLoadProjectsRegistry,
}));

jest.unstable_mockModule('~/commands/project-state', () => ({
  loadProjectState: mockLoadProjectState,
  getRecipeAccounts: (
    state: { recipes: Record<string, { accounts: string[] }> },
    recipeName: string
  ) => state.recipes[recipeName]?.accounts ?? [],
}));

jest.unstable_mockModule('~/recipes/recipe-loader', () => ({
  loadRecipe: mockLoadRecipe,
}));

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
}));

const {
  getDefaultAccount,
  loadAccountsConfig,
  resolveAccount,
  setDefaultAccount,
} = await import('~/config/accounts');
const {
  handleAccountsSetDefault,
  handleAccountsShow,
  handleAccountsUnsetDefault,
} = await import('~/commands/accounts');

let tempDir: string;
let originalXdg: string | undefined;

beforeEach(async () => {
  tempDir = await createTempDir();
  originalXdg = process.env['XDG_CONFIG_HOME'];
  process.env['XDG_CONFIG_HOME'] = tempDir;
  await mkdir(join(tempDir, 'plugga'), { recursive: true });

  mockRenameMcpEntry.mockResolvedValue(true);
  mockLoadProjectsRegistry.mockResolvedValue({});
  mockLoadProjectState.mockResolvedValue({ recipes: {} });
  mockLoadRecipe.mockResolvedValue({
    name: 'my-recipe',
    service: 'github',
    type: 'mcp',
    description: 'test',
    mcp: { transport: 'stdio', command: 'npx', args: [] },
  });
  mockLogInfo.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (originalXdg === undefined) {
    delete process.env['XDG_CONFIG_HOME'];
  } else {
    process.env['XDG_CONFIG_HOME'] = originalXdg;
  }
  await cleanupTempDir(tempDir);
});

describe('accounts', () => {
  it('should return empty defaults when file does not exist', async () => {
    const config = await loadAccountsConfig();
    expect(config).toEqual({ defaults: {} });
  });

  it('should set and get default account', async () => {
    await setDefaultAccount('github', 'myaccount');
    const account = await getDefaultAccount('github');
    expect(account).toBe('myaccount');
  });

  it('should persist accounts to disk', async () => {
    await setDefaultAccount('github', 'myaccount');

    const content = await readFile(
      join(tempDir, 'plugga', 'accounts.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ defaults: { github: 'myaccount' } });
  });

  it('should return undefined for missing service default', async () => {
    const account = await getDefaultAccount('nonexistent');
    expect(account).toBeUndefined();
  });

  it('should resolve explicit account without checking defaults', async () => {
    const account = await resolveAccount('github', 'explicit');
    expect(account).toBe('explicit');
  });

  it('should resolve to default account when no explicit account given', async () => {
    await setDefaultAccount('github', 'default-acct');
    const account = await resolveAccount('github', undefined);
    expect(account).toBe('default-acct');
  });

  it('should throw when no explicit account and no default set', async () => {
    await expect(resolveAccount('github', undefined)).rejects.toThrow(
      'No account specified and no default account set for "github"'
    );
  });

  it('should handle multiple services independently', async () => {
    await setDefaultAccount('github', 'gh-acct');
    await setDefaultAccount('slack', 'slack-acct');

    expect(await getDefaultAccount('github')).toBe('gh-acct');
    expect(await getDefaultAccount('slack')).toBe('slack-acct');
  });

  it('should overwrite existing default account', async () => {
    await setDefaultAccount('github', 'old');
    await setDefaultAccount('github', 'new');
    expect(await getDefaultAccount('github')).toBe('new');
  });
});

describe('handleAccountsShow', () => {
  it('should show default account when set', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    await setDefaultAccount('github', 'myaccount');
    await handleAccountsShow('github');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('myaccount')
    );
  });

  it('should show no default when not set', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    await handleAccountsShow('github');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No default account')
    );
  });
});

describe('handleAccountsSetDefault', () => {
  it('should update the default account', async () => {
    await handleAccountsSetDefault({ service: 'github', account: 'newacct' });
    expect(await getDefaultAccount('github')).toBe('newacct');
  });

  it('should rename plain-named MCP entry to suffixed when changing default', async () => {
    await setDefaultAccount('github', 'oldacct');
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['oldacct'] } },
    });

    await handleAccountsSetDefault({ service: 'github', account: 'newacct' });

    expect(mockRenameMcpEntry).toHaveBeenCalledWith(
      '/my/project',
      'my-recipe',
      'my-recipe-oldacct'
    );
  });

  it('should rename suffixed new-default entry to plain when changing default', async () => {
    await setDefaultAccount('github', 'oldacct');
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['oldacct', 'newacct'] } },
    });

    await handleAccountsSetDefault({ service: 'github', account: 'newacct' });

    expect(mockRenameMcpEntry).toHaveBeenCalledWith(
      '/my/project',
      'my-recipe-newacct',
      'my-recipe'
    );
  });

  it('should not rename entries for other services', async () => {
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['oldacct'] } },
    });
    mockLoadRecipe.mockResolvedValue({
      name: 'my-recipe',
      service: 'linear',
      type: 'mcp',
      description: 'test',
      mcp: { transport: 'stdio', command: 'npx', args: [] },
    });

    await handleAccountsSetDefault({ service: 'github', account: 'newacct' });

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
  });

  it('should skip non-mcp recipes', async () => {
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['oldacct'] } },
    });
    mockLoadRecipe.mockResolvedValue({
      name: 'my-recipe',
      service: 'github',
      type: 'skill',
      description: 'test',
    } as unknown as McpRecipe);

    await handleAccountsSetDefault({ service: 'github', account: 'newacct' });

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
  });
});

describe('handleAccountsUnsetDefault', () => {
  it('should remove the default account', async () => {
    await setDefaultAccount('github', 'myacct');
    await handleAccountsUnsetDefault('github');
    expect(await getDefaultAccount('github')).toBeUndefined();
  });

  it('should do nothing when no default is set', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    await handleAccountsUnsetDefault('github');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No default account set')
    );
    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
  });

  it('should rename plain-named MCP entry to suffixed', async () => {
    await setDefaultAccount('github', 'myacct');
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['myacct'] } },
    });

    await handleAccountsUnsetDefault('github');

    expect(mockRenameMcpEntry).toHaveBeenCalledWith(
      '/my/project',
      'my-recipe',
      'my-recipe-myacct'
    );
  });

  it('should skip recipes not set up in the project', async () => {
    await setDefaultAccount('github', 'myacct');
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['otheracct'] } },
    });

    await handleAccountsUnsetDefault('github');

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
  });
});
