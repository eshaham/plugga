import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  addRecipeAccount,
  getRecipeAccounts,
  loadProjectState,
  saveProjectState,
} from '~/commands/project-state';
import type { ProjectState } from '~/commands/project-state';

import { cleanupTempDir, createTempDir } from './test-helpers';

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir();
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

describe('project state', () => {
  describe('loadProjectState', () => {
    it('should return empty state for missing file', async () => {
      const state = await loadProjectState(tempDir);
      expect(state).toEqual({ recipes: {} });
    });

    it('should load existing state from file', async () => {
      const claudeDir = join(tempDir, '.claude');
      await mkdir(claudeDir, { recursive: true });
      const expectedState: ProjectState = {
        recipes: { 'my-recipe': { accounts: ['acct1'] } },
      };
      await writeFile(
        join(claudeDir, 'plugga.json'),
        JSON.stringify(expectedState, null, 2),
        'utf-8'
      );

      const state = await loadProjectState(tempDir);
      expect(state).toEqual(expectedState);
    });
  });

  describe('saveProjectState', () => {
    it('should create the file and .claude directory', async () => {
      const state: ProjectState = {
        recipes: { 'my-recipe': { accounts: ['acct1'] } },
      };
      await saveProjectState(tempDir, state);

      const content = await readFile(
        join(tempDir, '.claude', 'plugga.json'),
        'utf-8'
      );
      expect(JSON.parse(content)).toEqual(state);
    });
  });

  describe('addRecipeAccount', () => {
    it('should add a new account to empty state', () => {
      const state: ProjectState = { recipes: {} };
      const updated = addRecipeAccount(state, 'my-recipe', 'acct1');
      expect(updated.recipes['my-recipe']?.accounts).toEqual(['acct1']);
    });

    it('should add a second account', () => {
      const state: ProjectState = {
        recipes: { 'my-recipe': { accounts: ['acct1'] } },
      };
      const updated = addRecipeAccount(state, 'my-recipe', 'acct2');
      expect(updated.recipes['my-recipe']?.accounts).toEqual([
        'acct1',
        'acct2',
      ]);
    });

    it('should be idempotent for existing account', () => {
      const state: ProjectState = {
        recipes: { 'my-recipe': { accounts: ['acct1'] } },
      };
      const updated = addRecipeAccount(state, 'my-recipe', 'acct1');
      expect(updated).toBe(state);
    });

    it('should not mutate the original state', () => {
      const state: ProjectState = { recipes: {} };
      const updated = addRecipeAccount(state, 'my-recipe', 'acct1');
      expect(state.recipes).toEqual({});
      expect(updated.recipes['my-recipe']?.accounts).toEqual(['acct1']);
    });
  });

  describe('getRecipeAccounts', () => {
    it('should return empty array for unknown recipe', () => {
      const state: ProjectState = { recipes: {} };
      expect(getRecipeAccounts(state, 'nonexistent')).toEqual([]);
    });

    it('should return accounts for known recipe', () => {
      const state: ProjectState = {
        recipes: { 'my-recipe': { accounts: ['acct1', 'acct2'] } },
      };
      expect(getRecipeAccounts(state, 'my-recipe')).toEqual(['acct1', 'acct2']);
    });
  });
});
