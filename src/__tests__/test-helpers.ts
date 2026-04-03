import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SecretReference, SecretsStore } from '~/secrets/types';

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
  };
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'plugga-test-'));
}

async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export { cleanupTempDir, createMockStore, createTempDir };
