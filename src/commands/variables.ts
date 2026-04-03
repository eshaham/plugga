import { getVariablesForAccount, setVariable } from '~/config/variables';
import { logError, logInfo } from '~/logging/logger';

interface VariablesSetInput {
  service: string;
  account: string;
  name: string;
  value: string;
}

interface VariablesGetInput {
  service: string;
  account?: string;
}

async function handleVariablesSet(input: VariablesSetInput): Promise<void> {
  try {
    await setVariable(input.service, input.account, input.name, input.value);
    console.log(
      `Set variable "${input.name}" = "${input.value}" for ${input.service}/${input.account}`
    );
    await logInfo('variables.set', {
      service: input.service,
      account: input.account,
      name: input.name,
    });
  } catch (error) {
    await logError('variables.set', error, {
      service: input.service,
      account: input.account,
      name: input.name,
    });
    console.error(
      `Failed to set variable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function handleVariablesGet(input: VariablesGetInput): Promise<void> {
  if (!input.account) {
    console.error(
      'No account specified. Use --account or set a default with "plugga accounts set-default".'
    );
    return;
  }

  try {
    const variables = await getVariablesForAccount(
      input.service,
      input.account
    );
    const entries = Object.entries(variables);

    if (entries.length === 0) {
      console.log(`No variables set for ${input.service}/${input.account}`);
      return;
    }

    for (const [name, value] of entries) {
      console.log(`${name}: ${value}`);
    }
    await logInfo('variables.get', {
      service: input.service,
      account: input.account,
    });
  } catch (error) {
    await logError('variables.get', error, {
      service: input.service,
      account: input.account,
    });
    console.error(
      `Failed to get variables: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export { handleVariablesGet, handleVariablesSet };
export type { VariablesGetInput, VariablesSetInput };
