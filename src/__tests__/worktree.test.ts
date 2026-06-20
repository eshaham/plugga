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

import { cleanupTempDir, createTempDir } from './test-helpers';

const mockExec =
  jest.fn<
    (
      cmd: string,
      args: string[],
      options?: { cwd?: string }
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  >();

jest.unstable_mockModule('~/exec/runner', () => ({
  exec: mockExec,
}));

const {
  addSettingsLocalInclude,
  copyConfigToWorktree,
  getWorktreeInfo,
  hasSettingsLocalInclude,
} = await import('~/git/worktree');

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir();
  mockExec.mockReset();
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

function execReply(stdout: string, exitCode = 0) {
  return Promise.resolve({ stdout, stderr: '', exitCode });
}

describe('getWorktreeInfo', () => {
  it('returns null when not a git repo', async () => {
    mockExec.mockReturnValueOnce(execReply('', 128));

    const info = await getWorktreeInfo(tempDir);

    expect(info).toBeNull();
  });

  it('reports a non-worktree when git-dir equals git-common-dir', async () => {
    mockExec
      .mockReturnValueOnce(execReply('/repo'))
      .mockReturnValueOnce(execReply('/repo/.git\n/repo/.git'));

    const info = await getWorktreeInfo(tempDir);

    expect(info).toEqual({
      isWorktree: false,
      worktreeRoot: '/repo',
      mainRoot: '/repo',
    });
  });

  it('detects a worktree and resolves the main root', async () => {
    mockExec
      .mockReturnValueOnce(execReply('/repo/.wt/feature'))
      .mockReturnValueOnce(
        execReply('/repo/.git/worktrees/feature\n/repo/.git')
      )
      .mockReturnValueOnce(
        execReply('worktree /repo\nHEAD abc\n\nworktree /repo/.wt/feature\n')
      );

    const info = await getWorktreeInfo(tempDir);

    expect(info).toEqual({
      isWorktree: true,
      worktreeRoot: '/repo/.wt/feature',
      mainRoot: '/repo',
    });
  });
});

describe('hasSettingsLocalInclude', () => {
  it('returns false when .worktreeinclude is missing', async () => {
    expect(await hasSettingsLocalInclude(tempDir)).toBe(false);
  });

  it('returns true when the entry is present', async () => {
    await writeFile(
      resolve(tempDir, '.worktreeinclude'),
      '.env\n.claude/settings.local.json\n',
      'utf-8'
    );

    expect(await hasSettingsLocalInclude(tempDir)).toBe(true);
  });
});

describe('addSettingsLocalInclude', () => {
  it('creates the file when missing', async () => {
    await addSettingsLocalInclude(tempDir);

    const content = await readFile(
      resolve(tempDir, '.worktreeinclude'),
      'utf-8'
    );
    expect(content).toBe('.claude/settings.local.json\n');
  });

  it('appends without clobbering existing entries', async () => {
    await writeFile(resolve(tempDir, '.worktreeinclude'), '.env', 'utf-8');

    await addSettingsLocalInclude(tempDir);

    const content = await readFile(
      resolve(tempDir, '.worktreeinclude'),
      'utf-8'
    );
    expect(content).toBe('.env\n.claude/settings.local.json\n');
  });
});

describe('copyConfigToWorktree', () => {
  it('copies existing settings and skill files into the worktree', async () => {
    const mainRoot = resolve(tempDir, 'main');
    const worktreeRoot = resolve(tempDir, 'wt');
    await mkdir(resolve(mainRoot, '.claude', 'skills', 'my-skill'), {
      recursive: true,
    });
    await writeFile(
      resolve(mainRoot, '.claude', 'settings.local.json'),
      '{"env":{"TOKEN":"x"}}',
      'utf-8'
    );
    await writeFile(
      resolve(mainRoot, '.claude', 'skills', 'my-skill', 'SKILL.md'),
      '# Skill',
      'utf-8'
    );

    await copyConfigToWorktree(mainRoot, worktreeRoot, 'my-skill');

    const settings = await readFile(
      resolve(worktreeRoot, '.claude', 'settings.local.json'),
      'utf-8'
    );
    const skill = await readFile(
      resolve(worktreeRoot, '.claude', 'skills', 'my-skill', 'SKILL.md'),
      'utf-8'
    );
    expect(settings).toBe('{"env":{"TOKEN":"x"}}');
    expect(skill).toBe('# Skill');
  });

  it('skips files that do not exist', async () => {
    const mainRoot = resolve(tempDir, 'main');
    const worktreeRoot = resolve(tempDir, 'wt');
    await mkdir(mainRoot, { recursive: true });

    await expect(
      copyConfigToWorktree(mainRoot, worktreeRoot, 'missing')
    ).resolves.toBeUndefined();
  });
});
