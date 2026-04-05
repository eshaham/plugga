import { getTag, resolveProfile } from '~/config/profiles';
import { exec } from '~/exec/runner';
import { logError, logInfo } from '~/logging/logger';

import type { AccountReference, SecretReference, SecretsStore } from './types';

function itemTitle(ref: SecretReference): string {
  return `${ref.service}/${ref.account}`;
}

async function opArgs(
  accountName: string
): Promise<{ vault: string; account: string }> {
  const profile = await resolveProfile(accountName);
  return { vault: profile.vault, account: profile.opAccount };
}

async function itemExists(
  ref: SecretReference
): Promise<{ exists: boolean; hasField: boolean }> {
  const { vault, account } = await opArgs(ref.account);
  const result = await exec('op', [
    'item',
    'get',
    itemTitle(ref),
    '--vault',
    vault,
    '--account',
    account,
    '--format',
    'json',
  ]);

  if (result.exitCode !== 0) {
    return { exists: false, hasField: false };
  }

  try {
    const item = JSON.parse(result.stdout) as {
      fields?: Array<{ label: string }>;
    };
    const hasField = item.fields?.some((f) => f.label === ref.key) ?? false;
    return { exists: true, hasField };
  } catch {
    return { exists: true, hasField: false };
  }
}

async function createItem(ref: SecretReference, value: string): Promise<void> {
  const { vault, account } = await opArgs(ref.account);
  const tag = await getTag();
  const tags = [tag, ref.service].join(',');

  const result = await exec('op', [
    'item',
    'create',
    '--category',
    'secureNote',
    '--title',
    itemTitle(ref),
    '--vault',
    vault,
    '--account',
    account,
    '--tags',
    tags,
    `${ref.key}[concealed]=${value}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create 1Password item: ${result.stderr}`);
  }
}

async function addFieldToItem(
  ref: SecretReference,
  value: string
): Promise<void> {
  const { vault, account } = await opArgs(ref.account);

  const result = await exec('op', [
    'item',
    'edit',
    itemTitle(ref),
    '--vault',
    vault,
    '--account',
    account,
    `${ref.key}[concealed]=${value}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to add field to 1Password item: ${result.stderr}`);
  }
}

async function editField(ref: SecretReference, value: string): Promise<void> {
  const { vault, account } = await opArgs(ref.account);

  const result = await exec('op', [
    'item',
    'edit',
    itemTitle(ref),
    '--vault',
    vault,
    '--account',
    account,
    `${ref.key}[concealed]=${value}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to update 1Password field: ${result.stderr}`);
  }
}

function createOnePasswordStore(): SecretsStore {
  return {
    async get(ref: SecretReference): Promise<string> {
      const { vault, account } = await opArgs(ref.account);
      const result = await exec('op', [
        'item',
        'get',
        itemTitle(ref),
        '--vault',
        vault,
        '--account',
        account,
        '--fields',
        `label=${ref.key}`,
        '--reveal',
      ]);

      if (result.exitCode !== 0) {
        throw new Error(
          `Secret "${ref.key}" not found for ${ref.service}/${ref.account}`
        );
      }

      await logInfo('secrets.get', {
        service: ref.service,
        account: ref.account,
        key: ref.key,
      });
      return result.stdout;
    },

    async set(ref: SecretReference, value: string): Promise<void> {
      const status = await itemExists(ref);

      if (!status.exists) {
        await createItem(ref, value);
      } else if (!status.hasField) {
        await addFieldToItem(ref, value);
      } else {
        await editField(ref, value);
      }

      await logInfo('secrets.set', {
        service: ref.service,
        account: ref.account,
        key: ref.key,
      });
    },

    async has(ref: SecretReference): Promise<boolean> {
      const status = await itemExists(ref);
      return status.hasField;
    },

    async delete(ref: SecretReference): Promise<void> {
      const { vault, account } = await opArgs(ref.account);
      const result = await exec('op', [
        'item',
        'edit',
        itemTitle(ref),
        '--vault',
        vault,
        '--account',
        account,
        '--delete-field',
        ref.key,
      ]);

      if (result.exitCode !== 0) {
        await logError('secrets.delete', new Error(result.stderr), {
          service: ref.service,
          account: ref.account,
          key: ref.key,
        });
        throw new Error(
          `Failed to delete secret "${ref.key}" for ${ref.service}/${ref.account}`
        );
      }

      await logInfo('secrets.delete', {
        service: ref.service,
        account: ref.account,
        key: ref.key,
      });
    },

    async deleteAccount(ref: AccountReference): Promise<void> {
      const { vault, account } = await opArgs(ref.account);
      const title = `${ref.service}/${ref.account}`;
      const result = await exec('op', [
        'item',
        'delete',
        title,
        '--vault',
        vault,
        '--account',
        account,
      ]);

      if (result.exitCode !== 0) {
        await logError('secrets.delete-account', new Error(result.stderr), {
          service: ref.service,
          account: ref.account,
        });
        throw new Error(
          `Failed to delete secrets for ${ref.service}/${ref.account}`
        );
      }

      await logInfo('secrets.delete-account', {
        service: ref.service,
        account: ref.account,
      });
    },
  };
}

export { createOnePasswordStore };
