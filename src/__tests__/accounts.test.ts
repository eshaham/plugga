import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { McpRecipe } from '~/recipes/types';

import { createMockStore } from './test-helpers';

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
const mockSaveProjectState =
  jest.fn<
    (
      projectDir: string,
      state: { recipes: Record<string, { accounts: string[] }> }
    ) => Promise<void>
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
  saveProjectState: mockSaveProjectState,
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

const { handleAccountsList, handleAccountsRename } =
  await import('~/commands/accounts');

beforeEach(() => {
  mockRenameMcpEntry.mockResolvedValue(true);
  mockLoadProjectsRegistry.mockResolvedValue({});
  mockLoadProjectState.mockResolvedValue({ recipes: {} });
  mockSaveProjectState.mockResolvedValue(undefined);
  mockLoadRecipe.mockResolvedValue({
    name: 'my-recipe',
    service: 'github',
    type: 'mcp',
    description: 'test',
    mcp: { transport: 'stdio', command: 'npx', args: [] },
  });
  mockLogInfo.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('handleAccountsList', () => {
  it('should list accounts for a service', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'token1',
      'github/work/api-key': 'token2',
    });

    await handleAccountsList('github', store);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('github'));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('personal')
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('work'));
  });

  it('should show message when no accounts exist', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({});

    await handleAccountsList('github', store);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No accounts found')
    );
  });

  it('should not list accounts from other services', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'token1',
      'linear/work/api-key': 'token2',
    });

    await handleAccountsList('github', store);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('linear'))).toBe(false);
  });

  it('should print error when store throws', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore({});
    jest.spyOn(store, 'listAccounts').mockRejectedValue(new Error('op failed'));

    await handleAccountsList('github', store);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to list accounts')
    );
  });

  it('should list accounts as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'token1',
      'github/work/api-key': 'token2',
    });

    await handleAccountsList('github', store, { json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      service: 'github',
      accounts: [{ name: 'personal' }, { name: 'work' }],
    });
  });

  it('should list empty accounts as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({});

    await handleAccountsList('github', store, { json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      service: 'github',
      accounts: [],
    });
  });

  it('should print error as JSON when store throws', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore({});
    jest.spyOn(store, 'listAccounts').mockRejectedValue(new Error('op failed'));

    await handleAccountsList('github', store, { json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      error: expect.stringContaining('Failed to list accounts'),
    });
  });
});

describe('handleAccountsRename', () => {
  it('should rename the MCP entry and project state across projects', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['oldacct'] } },
    });

    await handleAccountsRename({
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });

    expect(mockRenameMcpEntry).toHaveBeenCalledWith(
      '/my/project',
      'my-recipe-oldacct',
      'my-recipe-newacct'
    );
    expect(mockSaveProjectState).toHaveBeenCalledWith('/my/project', {
      recipes: { 'my-recipe': { accounts: ['newacct'] } },
    });
  });

  it('should not rename entries for other services', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
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

    await handleAccountsRename({
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
    expect(mockSaveProjectState).not.toHaveBeenCalled();
  });

  it('should skip recipes where the account is not set up', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLoadProjectsRegistry.mockResolvedValue({
      '/my/project': ['my-recipe'],
    });
    mockLoadProjectState.mockResolvedValue({
      recipes: { 'my-recipe': { accounts: ['otheracct'] } },
    });

    await handleAccountsRename({
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
    expect(mockSaveProjectState).not.toHaveBeenCalled();
  });

  it('should update project state but not MCP entries for skill recipes', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
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

    await handleAccountsRename({
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });

    expect(mockRenameMcpEntry).not.toHaveBeenCalled();
    expect(mockSaveProjectState).toHaveBeenCalledWith('/my/project', {
      recipes: { 'my-recipe': { accounts: ['newacct'] } },
    });
  });

  it('should log the rename action', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await handleAccountsRename({
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });

    expect(mockLogInfo).toHaveBeenCalledWith('accounts.rename', {
      service: 'github',
      oldName: 'oldacct',
      newName: 'newacct',
    });
  });
});
