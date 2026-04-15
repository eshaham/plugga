import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  AccountReference,
  SecretReference,
  SecretsStore,
} from '~/secrets/types';

function makeKey(ref: SecretReference): string {
  return `${ref.service}/${ref.account}/${ref.key}`;
}

function createMockStore(initial?: Record<string, string>): SecretsStore {
  const data = new Map<string, string>(initial ? Object.entries(initial) : []);

  return {
    get(ref: SecretReference): Promise<string> {
      const key = makeKey(ref);
      const value = data.get(key);
      if (value === undefined) {
        return Promise.reject(new Error(`Secret not found: ${key}`));
      }
      return Promise.resolve(value);
    },
    set(ref: SecretReference, value: string): Promise<void> {
      data.set(makeKey(ref), value);
      return Promise.resolve();
    },
    has(ref: SecretReference): Promise<boolean> {
      return Promise.resolve(data.has(makeKey(ref)));
    },
    delete(ref: SecretReference): Promise<void> {
      data.delete(makeKey(ref));
      return Promise.resolve();
    },
    deleteAccount(ref: AccountReference): Promise<void> {
      for (const key of data.keys()) {
        if (key.startsWith(`${ref.service}/${ref.account}/`)) {
          data.delete(key);
        }
      }
      return Promise.resolve();
    },
    listAccounts(service: string): Promise<string[]> {
      const accounts = new Set<string>();
      for (const key of data.keys()) {
        const parts = key.split('/');
        if (parts[0] === service && parts[1] !== undefined) {
          accounts.add(parts[1]);
        }
      }
      return Promise.resolve([...accounts]);
    },
  };
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'plugga-test-'));
}

async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export { cleanupTempDir, createMockStore, createTempDir };
