import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { McpRecipe, SkillRecipe } from '~/recipes/types';

import { cleanupTempDir, createMockStore, createTempDir } from './test-helpers';

const mockResolveAccount =
  jest.fn<(service: string, account: string | undefined) => Promise<string>>();
const mockGetDefaultAccount =
  jest.fn<(service: string) => Promise<string | undefined>>();
const mockLoadRecipe =
  jest.fn<(name: string) => Promise<McpRecipe | SkillRecipe>>();
const mockLoadSkillContent =
  jest.fn<(name: string) => Promise<string | undefined>>();
const mockExec =
  jest.fn<
    (
      cmd: string,
      args: string[]
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  >();
const mockLogInfo =
  jest.fn<
    (action: string, details?: Record<string, unknown>) => Promise<void>
  >();
const mockLogError =
  jest.fn<
    (
      action: string,
      error: unknown,
      details?: Record<string, unknown>
    ) => Promise<void>
  >();
const mockGetVariablesForAccount =
  jest.fn<
    (service: string, account: string) => Promise<Record<string, string>>
  >();
const mockHomedir = jest.fn<() => string>();

jest.unstable_mockModule('~/config/accounts', () => ({
  resolveAccount: mockResolveAccount,
  getDefaultAccount: mockGetDefaultAccount,
}));

jest.unstable_mockModule('~/recipes/recipe-loader', () => ({
  loadRecipe: mockLoadRecipe,
  loadSkillContent: mockLoadSkillContent,
}));

jest.unstable_mockModule('~/exec/runner', () => ({
  exec: mockExec,
}));

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
}));

jest.unstable_mockModule('~/config/variables', () => ({
  getVariablesForAccount: mockGetVariablesForAccount,
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: mockHomedir,
}));

const { handleSetup } = await import('~/commands/setup');

let tempDir: string;
let homeDir: string;

beforeEach(async () => {
  tempDir = await createTempDir();
  homeDir = resolve(tempDir, 'home');
  await mkdir(homeDir, { recursive: true });
  mockHomedir.mockReturnValue(homeDir);
  mockGetVariablesForAccount.mockResolvedValue({});
  mockGetDefaultAccount.mockResolvedValue('myaccount');
  mockLogInfo.mockResolvedValue(undefined);
  mockLogError.mockResolvedValue(undefined);
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

async function initClaudeJson(projectDir: string): Promise<void> {
  const claudeJsonPath = resolve(homeDir, '.claude.json');
  const claudeJson = { projects: { [projectDir]: { mcpServers: {} } } };
  await writeFile(claudeJsonPath, JSON.stringify(claudeJson, null, 2), 'utf-8');
}

async function readClaudeJsonMcpServers(
  projectDir: string
): Promise<Record<string, unknown>> {
  const content = await readFile(resolve(homeDir, '.claude.json'), 'utf-8');
  const data = JSON.parse(content) as {
    projects: Record<string, { mcpServers: Record<string, unknown> }>;
  };
  return data.projects[projectDir]?.mcpServers ?? {};
}

function makeStdioRecipe(overrides?: Partial<McpRecipe>): McpRecipe {
  return {
    name: 'test-mcp',
    service: 'github',
    description: 'Test MCP',
    type: 'mcp',
    mcp: { transport: 'stdio', command: 'npx', args: ['@test/server'] },
    secrets: [{ name: 'api-key', envVar: 'GITHUB_TOKEN' }],
    ...overrides,
  };
}

function makeSseRecipe(overrides?: Partial<McpRecipe>): McpRecipe {
  return {
    name: 'test-sse',
    service: 'github',
    description: 'Test SSE',
    type: 'mcp',
    mcp: { transport: 'sse', url: 'https://example.com/sse' },
    secrets: [
      { name: 'api-key', header: 'Authorization', headerPrefix: 'Bearer ' },
    ],
    ...overrides,
  } as McpRecipe;
}

function makeHttpRecipe(overrides?: Partial<McpRecipe>): McpRecipe {
  return {
    name: 'test-http',
    service: 'github',
    description: 'Test HTTP',
    type: 'mcp',
    mcp: {
      transport: 'http',
      url: 'https://example.com/mcp',
      headers: { 'Content-Type': 'application/json' },
    },
    secrets: [
      { name: 'api-key', header: 'Authorization', headerPrefix: 'Token ' },
    ],
    ...overrides,
  } as McpRecipe;
}

function makeSkillRecipe(overrides?: Partial<SkillRecipe>): SkillRecipe {
  return {
    name: 'test-skill',
    service: 'github',
    description: 'Test Skill',
    type: 'skill',
    secrets: [{ name: 'api-key', envVar: 'GITHUB_TOKEN' }],
    ...overrides,
  };
}

async function readSettings(): Promise<Record<string, unknown>> {
  const content = await readFile(
    resolve(tempDir, '.claude', 'settings.local.json'),
    'utf-8'
  );
  return JSON.parse(content) as Record<string, unknown>;
}

async function readProjectState(): Promise<Record<string, unknown>> {
  const content = await readFile(
    resolve(tempDir, '.claude', 'plugga.json'),
    'utf-8'
  );
  return JSON.parse(content) as Record<string, unknown>;
}

describe('handleSetup', () => {
  describe('MCP stdio setup', () => {
    it('should write correct entry to ~/.claude.json', async () => {
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);

      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      const mcpServers = await readClaudeJsonMcpServers(tempDir);
      expect(mcpServers['test-mcp']).toEqual({
        command: 'npx',
        args: ['@test/server'],
        env: { GITHUB_TOKEN: 'secret123' },
      });
    });

    it('should fail if ~/.claude.json does not exist', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);

      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('~/.claude.json not found')
      );
    });

    it('should fail if project not in ~/.claude.json', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      await writeFile(
        resolve(homeDir, '.claude.json'),
        JSON.stringify({ projects: {} }),
        'utf-8'
      );

      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found in ~/.claude.json')
      );
    });
  });

  describe('MCP sse setup', () => {
    it('should write correct headers', async () => {
      const recipe = makeSseRecipe();
      const store = createMockStore({ 'github/myaccount/api-key': 'mytoken' });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);

      await handleSetup({ recipe: 'test-sse', projectDir: tempDir }, store);

      const mcpServers = await readClaudeJsonMcpServers(tempDir);
      expect(mcpServers['test-sse']).toEqual({
        url: 'https://example.com/sse',
        headers: { Authorization: 'Bearer mytoken' },
      });
    });
  });

  describe('MCP http setup', () => {
    it('should merge static and secret headers', async () => {
      const recipe = makeHttpRecipe();
      const store = createMockStore({ 'github/myaccount/api-key': 'mytoken' });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);

      await handleSetup({ recipe: 'test-http', projectDir: tempDir }, store);

      const mcpServers = await readClaudeJsonMcpServers(tempDir);
      expect(mcpServers['test-http']).toEqual({
        type: 'http',
        url: 'https://example.com/mcp',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Token mytoken',
        },
      });
    });
  });

  describe('skill setup', () => {
    it('should copy SKILL.md to project', async () => {
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# My Skill\nDo stuff.');

      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      const skillContent = await readFile(
        resolve(tempDir, '.claude', 'skills', 'test-skill', 'SKILL.md'),
        'utf-8'
      );
      expect(skillContent).toBe('# My Skill\nDo stuff.');
    });

    it('should generate context.md with variables and secrets', async () => {
      const recipe = makeSkillRecipe({
        variables: [{ name: 'org', description: 'GitHub org' }],
      });
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# My Skill');
      mockGetVariablesForAccount.mockResolvedValue({ org: 'my-org' });

      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      const contextContent = await readFile(
        resolve(tempDir, '.claude', 'skills', 'test-skill', 'context.md'),
        'utf-8'
      );
      expect(contextContent).toContain('Account: myaccount');
      expect(contextContent).toContain('- org: my-org');
      expect(contextContent).toContain('`GITHUB_TOKEN`');
    });

    it('should write env vars to settings.local.json', async () => {
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# My Skill');

      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      const settings = await readSettings();
      const env = settings['env'] as Record<string, string>;
      expect(env['GITHUB_TOKEN']).toBe('secret123');
    });
  });

  describe('multi-account MCP setup', () => {
    it('should use suffixed names when no default account is set', async () => {
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/acct1/api-key': 'secret1',
        'github/acct2/api-key': 'secret2',
      });

      mockGetDefaultAccount.mockResolvedValue(undefined);
      mockResolveAccount.mockResolvedValue('acct1');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);
      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      mockResolveAccount.mockResolvedValue('acct2');
      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      const mcpServers = await readClaudeJsonMcpServers(tempDir);
      expect(mcpServers['test-mcp']).toBeUndefined();
      expect(mcpServers['test-mcp-acct1']).toBeDefined();
      expect(mcpServers['test-mcp-acct2']).toBeDefined();
    });

    it('should use plain name for default account and suffixed for others', async () => {
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/acct1/api-key': 'secret1',
        'github/acct2/api-key': 'secret2',
      });

      mockGetDefaultAccount.mockResolvedValue('acct1');
      mockResolveAccount.mockResolvedValue('acct1');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);
      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      mockResolveAccount.mockResolvedValue('acct2');
      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      const mcpServers = await readClaudeJsonMcpServers(tempDir);
      expect(mcpServers['test-mcp']).toBeDefined();
      expect(mcpServers['test-mcp-acct1']).toBeUndefined();
      expect(mcpServers['test-mcp-acct2']).toBeDefined();
    });
  });

  describe('multi-account skill setup', () => {
    it('should suffix env vars for multi-account', async () => {
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/acct1/api-key': 'secret1',
        'github/acct2/api-key': 'secret2',
      });

      mockResolveAccount.mockResolvedValue('acct1');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# Skill');
      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      mockResolveAccount.mockResolvedValue('acct2');
      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      const settings = await readSettings();
      const env = settings['env'] as Record<string, string>;
      expect(env['GITHUB_TOKEN_ACCT1']).toBe('secret1');
      expect(env['GITHUB_TOKEN_ACCT2']).toBe('secret2');
      expect(env['GITHUB_TOKEN']).toBeUndefined();
    });
  });

  describe('project state tracking', () => {
    it('should save recipe account to project state', async () => {
      const recipe = makeStdioRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      await initClaudeJson(tempDir);

      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      const state = await readProjectState();
      const recipes = state['recipes'] as Record<
        string,
        { accounts: string[] }
      >;
      expect(recipes['test-mcp']?.accounts).toEqual(['myaccount']);
    });
  });

  describe('.gitignore warning', () => {
    it('should warn when settings.local.json not in .gitignore', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# Skill');

      await writeFile(
        resolve(tempDir, '.gitignore'),
        'node_modules\n',
        'utf-8'
      );
      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json is not in .gitignore')
      );
    });

    it('should warn when no .gitignore exists', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# Skill');

      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No .gitignore found')
      );
    });

    it('should not warn when settings.local.json is in .gitignore', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadRecipe.mockResolvedValue(recipe);
      mockLoadSkillContent.mockResolvedValue('# Skill');

      await writeFile(
        resolve(tempDir, '.gitignore'),
        '.claude/settings.local.json\nnode_modules\n',
        'utf-8'
      );
      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      const envWarnings = consoleSpy.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' &&
          (call[0].includes('settings.local.json is not in .gitignore') ||
            call[0].includes('No .gitignore found'))
      );
      expect(envWarnings).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should log error and print message when setup fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const store = createMockStore();

      mockLoadRecipe.mockResolvedValue({
        name: 'test-mcp',
        service: 'test',
        type: 'mcp',
        description: 'test',
        mcp: { transport: 'stdio', command: 'echo' },
      } as McpRecipe);
      mockResolveAccount.mockRejectedValue(new Error('No account specified'));
      mockLogError.mockResolvedValue(undefined);

      await handleSetup({ recipe: 'test-mcp', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No account specified')
      );
      expect(mockLogError).toHaveBeenCalled();
    });

    it('should fail if skill recipe has no SKILL.md', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const recipe = makeSkillRecipe();
      const store = createMockStore({
        'github/myaccount/api-key': 'secret123',
      });

      mockLoadRecipe.mockResolvedValue(recipe);
      mockResolveAccount.mockResolvedValue('myaccount');
      mockLoadSkillContent.mockResolvedValue(undefined);

      await handleSetup({ recipe: 'test-skill', projectDir: tempDir }, store);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SKILL.md is required')
      );
    });
  });
});
