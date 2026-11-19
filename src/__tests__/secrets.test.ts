import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { cleanupTempDir, createMockStore, createTempDir } from './test-helpers';

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

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
  logError: mockLogError,
}));

const {
  handleSecretsDelete,
  handleSecretsDeleteAccount,
  handleSecretsGet,
  handleSecretsSet,
} = await import('~/commands/secrets');

const originalExitCode = process.exitCode;
const originalXdg = process.env['XDG_CONFIG_HOME'];
let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir();
  process.env['XDG_CONFIG_HOME'] = tempDir;
  jest.clearAllMocks();
  mockLogInfo.mockResolvedValue(undefined);
  mockLogError.mockResolvedValue(undefined);
  process.exitCode = 0;
});

afterEach(async () => {
  jest.restoreAllMocks();
  process.exitCode = originalExitCode;
  if (originalXdg === undefined) {
    delete process.env['XDG_CONFIG_HOME'];
  } else {
    process.env['XDG_CONFIG_HOME'] = originalXdg;
  }
  await cleanupTempDir(tempDir);
});

describe('secrets set', () => {
  it('should set a secret and log success', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore();

    await handleSecretsSet(
      {
        service: 'github',
        account: 'personal',
        name: 'api-key',
        value: 'abc123',
      },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Set "api-key" for github/personal'
    );
    expect(
      await store.has({
        service: 'github',
        account: 'personal',
        key: 'api-key',
      })
    ).toBe(true);
  });

  it('should log error on failure', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();
    jest.spyOn(store, 'set').mockRejectedValue(new Error('op failed'));

    await handleSecretsSet(
      {
        service: 'github',
        account: 'personal',
        name: 'api-key',
        value: 'abc123',
      },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to set secret')
    );
    expect(mockLogError).toHaveBeenCalled();
  });
});

describe('secrets get', () => {
  it('should use the only account when none is specified', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({ 'github/personal/api-key': 'abc123' });

    await handleSecretsGet({ service: 'github', name: 'api-key' }, store);

    expect(consoleSpy).toHaveBeenCalledWith('api-key: abc123');
    expect(process.exitCode).toBe(0);
  });

  it('should list accounts when several exist and none is specified', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'a',
      'github/work/api-key': 'b',
    });

    await handleSecretsGet({ service: 'github', name: 'api-key' }, store);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('multiple accounts (personal, work)')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should print error when the service has no accounts', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();

    await handleSecretsGet({ service: 'github' }, store);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No accounts found')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should get and print a specific secret', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({ 'github/personal/api-key': 'abc123' });

    await handleSecretsGet(
      { service: 'github', account: 'personal', name: 'api-key' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith('api-key: abc123');
    expect(process.exitCode).toBe(0);
  });

  it('should set a non-zero exit code when the read fails', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();
    jest.spyOn(store, 'get').mockRejectedValue(new Error('op failed'));

    await handleSecretsGet(
      { service: 'github', account: 'personal', name: 'api-key' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get secret')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should print a specific secret as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({ 'github/personal/api-key': 'abc123' });

    await handleSecretsGet(
      { service: 'github', account: 'personal', name: 'api-key', json: true },
      store
    );

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      service: 'github',
      account: 'personal',
      name: 'api-key',
      value: 'abc123',
    });
  });

  it('should round-trip multi-line and colon-containing values as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const value =
      '-----BEGIN KEY-----\nline: with colon\nfoo\n-----END KEY-----';
    const store = createMockStore({ 'gcp/prod/credentials': value });

    await handleSecretsGet(
      { service: 'gcp', account: 'prod', name: 'credentials', json: true },
      store
    );

    expect(
      (JSON.parse(consoleSpy.mock.calls[0]?.[0] as string) as { value: string })
        .value
    ).toBe(value);
  });

  it('should print error as JSON when the service has no accounts', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();

    await handleSecretsGet({ service: 'github', json: true }, store);

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      error: expect.stringContaining('No accounts found'),
    });
  });

  it('should print error as JSON on failure', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();
    jest.spyOn(store, 'get').mockRejectedValue(new Error('op failed'));

    await handleSecretsGet(
      { service: 'github', account: 'personal', name: 'api-key', json: true },
      store
    );

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      error: expect.stringContaining('Failed to get secret'),
    });
  });
});

describe('secrets delete', () => {
  it('should delete a specific secret field and log success', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'abc123',
      'github/personal/token': 'tok456',
    });

    await handleSecretsDelete(
      { service: 'github', account: 'personal', name: 'api-key' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Deleted "api-key" for github/personal'
    );
    expect(
      await store.has({
        service: 'github',
        account: 'personal',
        key: 'api-key',
      })
    ).toBe(false);
    expect(
      await store.has({ service: 'github', account: 'personal', key: 'token' })
    ).toBe(true);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'secrets.delete',
      expect.objectContaining({ name: 'api-key' })
    );
  });

  it('should log error on failure', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();
    jest.spyOn(store, 'delete').mockRejectedValue(new Error('op failed'));

    await handleSecretsDelete(
      { service: 'github', account: 'personal', name: 'api-key' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete secret')
    );
    expect(mockLogError).toHaveBeenCalled();
  });
});

describe('secrets delete-account', () => {
  it('should delete all secrets for a service/account and log success', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({
      'github/personal/api-key': 'abc123',
      'github/personal/token': 'tok456',
    });

    await handleSecretsDeleteAccount(
      { service: 'github', account: 'personal' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Deleted all secrets for github/personal'
    );
    expect(
      await store.has({
        service: 'github',
        account: 'personal',
        key: 'api-key',
      })
    ).toBe(false);
    expect(
      await store.has({ service: 'github', account: 'personal', key: 'token' })
    ).toBe(false);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'secrets.delete-account',
      expect.objectContaining({ service: 'github', account: 'personal' })
    );
  });

  it('should log error on failure', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();
    jest
      .spyOn(store, 'deleteAccount')
      .mockRejectedValue(new Error('op failed'));

    await handleSecretsDeleteAccount(
      { service: 'github', account: 'personal' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete account secrets')
    );
    expect(mockLogError).toHaveBeenCalled();
  });
});
