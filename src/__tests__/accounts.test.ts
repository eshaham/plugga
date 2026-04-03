import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  getDefaultAccount,
  loadAccountsConfig,
  resolveAccount,
  setDefaultAccount,
} from '~/config/accounts';

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
