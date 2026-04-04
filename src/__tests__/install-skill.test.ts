import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cleanupTempDir, createTempDir } from './test-helpers';

let tempDir: string;

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
const mockInstallPluggaSkill = jest.fn<() => Promise<void>>();
const mockGetSkillDir = jest.fn<() => string>();

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
}));

jest.unstable_mockModule('~/skill/plugga-skill', () => ({
  getSkillDir: mockGetSkillDir,
  installPluggaSkill: mockInstallPluggaSkill,
}));

const { handleInstallSkill } = await import('~/commands/install-skill');

beforeEach(async () => {
  tempDir = await createTempDir();
  mockLogInfo.mockResolvedValue(undefined);
  mockLogError.mockResolvedValue(undefined);
  mockGetSkillDir.mockReturnValue(join(tempDir, '.claude', 'skills', 'plugga'));
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

describe('handleInstallSkill', () => {
  it('should install skill and print success message', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const skillDir = join(tempDir, '.claude', 'skills', 'plugga');
    mockInstallPluggaSkill.mockImplementation(async () => {
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# Plugga Skill\n', 'utf-8');
    });

    await handleInstallSkill();

    const content = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toBe('# Plugga Skill\n');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugga skill installed')
    );
    expect(mockLogInfo).toHaveBeenCalledWith('install-skill');
  });

  it('should handle errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error');
    mockInstallPluggaSkill.mockRejectedValue(new Error('Permission denied'));

    await handleInstallSkill();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
    expect(mockLogError).toHaveBeenCalled();
  });
});
