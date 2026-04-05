import { logError, logInfo } from '~/logging/logger';
import type { SecretsStore } from '~/secrets/types';

interface SecretsSetInput {
  service: string;
  account: string;
  name: string;
  value: string;
}

interface SecretsGetInput {
  service: string;
  account?: string;
  name?: string;
}

interface SecretsDeleteInput {
  service: string;
  account: string;
  name: string;
}

async function handleSecretsSet(
  input: SecretsSetInput,
  store: SecretsStore
): Promise<void> {
  try {
    await store.set(
      { service: input.service, account: input.account, key: input.name },
      input.value
    );
    console.log(`Set "${input.name}" for ${input.service}/${input.account}`);
    await logInfo('secrets.set', {
      service: input.service,
      account: input.account,
      name: input.name,
    });
  } catch (error) {
    await logError('secrets.set', error, {
      service: input.service,
      account: input.account,
      name: input.name,
    });
    console.error(
      `Failed to set secret: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function handleSecretsGet(
  input: SecretsGetInput,
  store: SecretsStore
): Promise<void> {
  const account = input.account;
  if (!account) {
    console.error(
      'No account specified. Use --account or set a default with "plugga accounts set-default".'
    );
    return;
  }

  try {
    if (input.name) {
      const value = await store.get({
        service: input.service,
        account,
        key: input.name,
      });
      console.log(`${input.name}: ${value}`);
    } else {
      console.log(`Secrets for ${input.service}/${account}:`);
      console.log('(Use --name to retrieve a specific secret)');
    }
    await logInfo('secrets.get', {
      service: input.service,
      account,
      name: input.name,
    });
  } catch (error) {
    await logError('secrets.get', error, {
      service: input.service,
      account,
      name: input.name,
    });
    console.error(
      `Failed to get secret: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function handleSecretsDelete(
  input: SecretsDeleteInput,
  store: SecretsStore
): Promise<void> {
  try {
    await store.delete({
      service: input.service,
      account: input.account,
      key: input.name,
    });
    console.log(
      `Deleted "${input.name}" for ${input.service}/${input.account}`
    );
    await logInfo('secrets.delete', {
      service: input.service,
      account: input.account,
      name: input.name,
    });
  } catch (error) {
    await logError('secrets.delete', error, {
      service: input.service,
      account: input.account,
      name: input.name,
    });
    console.error(
      `Failed to delete secret: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export { handleSecretsDelete, handleSecretsGet, handleSecretsSet };
export type { SecretsDeleteInput, SecretsGetInput, SecretsSetInput };
