import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import { createMockStore } from './test-helpers';

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

const { handleSecretsDelete, handleSecretsGet, handleSecretsSet } =
  await import('~/commands/secrets');

beforeEach(() => {
  jest.clearAllMocks();
  mockLogInfo.mockResolvedValue(undefined);
  mockLogError.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
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
  it('should print error when no account specified', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore();

    await handleSecretsGet({ service: 'github' }, store);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No account specified')
    );
  });

  it('should get and print a specific secret', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({ 'github/personal/api-key': 'abc123' });

    await handleSecretsGet(
      { service: 'github', account: 'personal', name: 'api-key' },
      store
    );

    expect(consoleSpy).toHaveBeenCalledWith('api-key: abc123');
  });
});

describe('secrets delete', () => {
  it('should delete a secret and log success', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const store = createMockStore({ 'github/personal/api-key': 'abc123' });

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
