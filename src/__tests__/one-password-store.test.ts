import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { Profile } from '~/config/profiles';
import type { ExecResult } from '~/exec/runner';

const mockExec =
  jest.fn<(cmd: string, args: string[]) => Promise<ExecResult>>();
const mockResolveProfile = jest.fn<(accountName: string) => Promise<Profile>>();
const mockGetTag = jest.fn<() => Promise<string>>();
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

jest.unstable_mockModule('~/exec/runner', () => ({
  exec: mockExec,
}));

jest.unstable_mockModule('~/config/profiles', () => ({
  resolveProfile: mockResolveProfile,
  getTag: mockGetTag,
}));

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
}));

const { createOnePasswordStore } = await import('~/secrets/one-password-store');

function execResult(partial: Partial<ExecResult>): ExecResult {
  return { stdout: '', stderr: '', exitCode: 0, ...partial };
}

const ref = { service: 'rawdash', account: 'rawdash', key: 'api-key' };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveProfile.mockResolvedValue({
    opAccount: 'my.1password.com',
    vault: 'Private',
  });
  mockGetTag.mockResolvedValue('plugga');
  mockLogInfo.mockResolvedValue(undefined);
  mockLogError.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('one-password store get', () => {
  it('returns the secret value on a healthy read', async () => {
    mockExec.mockResolvedValue(
      execResult({ stdout: JSON.stringify({ value: 'real-secret' }) })
    );
    const store = createOnePasswordStore();

    await expect(store.get(ref)).resolves.toBe('real-secret');
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty value instead of returning it', async () => {
    mockExec.mockResolvedValue(
      execResult({ stdout: JSON.stringify({ value: '' }) })
    );
    const store = createOnePasswordStore();

    await expect(store.get(ref)).rejects.toThrow(/is empty/);
  });

  it('retries once on a transient op lock and then succeeds', async () => {
    mockExec
      .mockResolvedValueOnce(
        execResult({
          exitCode: 1,
          stderr: 'error initializing client: response: promptError',
        })
      )
      .mockResolvedValueOnce(
        execResult({ stdout: JSON.stringify({ value: 'real-secret' }) })
      );
    const store = createOnePasswordStore();

    await expect(store.get(ref)).resolves.toBe('real-secret');
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-transient failure', async () => {
    mockExec.mockResolvedValue(
      execResult({ exitCode: 1, stderr: 'isn’t a field in the item' })
    );
    const store = createOnePasswordStore();

    await expect(store.get(ref)).rejects.toThrow(/not found/);
    expect(mockExec).toHaveBeenCalledTimes(1);
  });
});
