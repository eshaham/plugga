import { logError, logInfo } from '~/logging/logger';
import { errorMessage, printJson, printJsonError } from '~/output';
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
  json?: boolean;
}

interface SecretsDeleteInput {
  service: string;
  account: string;
  name: string;
}

interface SecretsDeleteAccountInput {
  service: string;
  account: string;
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
    const message =
      'No account specified. Use --account or set a default with "plugga accounts set-default".';
    if (input.json) {
      printJsonError(message);
    } else {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  try {
    if (input.name) {
      const value = await store.get({
        service: input.service,
        account,
        key: input.name,
      });
      if (input.json) {
        printJson({
          service: input.service,
          account,
          name: input.name,
          value,
        });
      } else {
        console.log(`${input.name}: ${value}`);
      }
    } else if (input.json) {
      printJson({
        service: input.service,
        account,
        message: 'Use --name to retrieve a specific secret value.',
      });
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
    const message = `Failed to get secret: ${errorMessage(error)}`;
    if (input.json) {
      printJsonError(message);
    } else {
      console.error(message);
    }
    process.exitCode = 1;
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

async function handleSecretsDeleteAccount(
  input: SecretsDeleteAccountInput,
  store: SecretsStore
): Promise<void> {
  try {
    await store.deleteAccount({
      service: input.service,
      account: input.account,
    });
    console.log(`Deleted all secrets for ${input.service}/${input.account}`);
    await logInfo('secrets.delete-account', {
      service: input.service,
      account: input.account,
    });
  } catch (error) {
    await logError('secrets.delete-account', error, {
      service: input.service,
      account: input.account,
    });
    console.error(
      `Failed to delete account secrets: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export {
  handleSecretsDelete,
  handleSecretsDeleteAccount,
  handleSecretsGet,
  handleSecretsSet,
};
export type {
  SecretsDeleteAccountInput,
  SecretsDeleteInput,
  SecretsGetInput,
  SecretsSetInput,
};
