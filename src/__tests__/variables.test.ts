import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getVariable,
  getVariablesForAccount,
  loadVariables,
  setVariable,
} from '~/config/variables';

import { cleanupTempDir, createTempDir } from './test-helpers';

let tempDir: string;
let originalXdg: string | undefined;

beforeEach(async () => {
  tempDir = await createTempDir();
  originalXdg = process.env['XDG_CONFIG_HOME'];
  process.env['XDG_CONFIG_HOME'] = tempDir;
  await mkdir(join(tempDir, 'plugga'), { recursive: true });
});

afterEach(async () => {
  if (originalXdg === undefined) {
    delete process.env['XDG_CONFIG_HOME'];
  } else {
    process.env['XDG_CONFIG_HOME'] = originalXdg;
  }
  await cleanupTempDir(tempDir);
});

describe('variables', () => {
  it('should return empty object when file does not exist', async () => {
    const result = await loadVariables();
    expect(result).toEqual({});
  });

  it('should set and get a variable', async () => {
    await setVariable('github', 'myaccount', 'org', 'my-org');
    const value = await getVariable('github', 'myaccount', 'org');
    expect(value).toBe('my-org');
  });

  it('should persist variables to disk', async () => {
    await setVariable('github', 'myaccount', 'org', 'my-org');

    const content = await readFile(
      join(tempDir, 'plugga', 'variables.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      github: { myaccount: { org: 'my-org' } },
    });
  });

  it('should return undefined for missing variable', async () => {
    const value = await getVariable('github', 'myaccount', 'nonexistent');
    expect(value).toBeUndefined();
  });

  it('should return undefined for missing service', async () => {
    const value = await getVariable('nonexistent', 'myaccount', 'key');
    expect(value).toBeUndefined();
  });

  it('should get variables for an account', async () => {
    await setVariable('github', 'myaccount', 'org', 'my-org');
    await setVariable('github', 'myaccount', 'repo', 'my-repo');

    const vars = await getVariablesForAccount('github', 'myaccount');
    expect(vars).toEqual({ org: 'my-org', repo: 'my-repo' });
  });

  it('should return empty object for missing account', async () => {
    const vars = await getVariablesForAccount('github', 'nonexistent');
    expect(vars).toEqual({});
  });

  it('should handle multiple services and accounts', async () => {
    await setVariable('github', 'acct1', 'org', 'org1');
    await setVariable('github', 'acct2', 'org', 'org2');
    await setVariable('slack', 'acct1', 'workspace', 'ws1');

    expect(await getVariable('github', 'acct1', 'org')).toBe('org1');
    expect(await getVariable('github', 'acct2', 'org')).toBe('org2');
    expect(await getVariable('slack', 'acct1', 'workspace')).toBe('ws1');
  });

  it('should handle corrupted file gracefully', async () => {
    await writeFile(
      join(tempDir, 'plugga', 'variables.json'),
      'not-json',
      'utf-8'
    );
    const result = await loadVariables();
    expect(result).toEqual({});
  });
});
