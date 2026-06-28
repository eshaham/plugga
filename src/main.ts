#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  handleAccountsList,
  handleAccountsRename,
  handleAccountsSetDefault,
  handleAccountsShow,
  handleAccountsUnsetDefault,
} from '~/commands/accounts';
import { handleInit } from '~/commands/init';
import { handleInstallSkill } from '~/commands/install-skill';
import { handleLogs } from '~/commands/logs';
import {
  handleRecipesAdd,
  handleRecipesList,
  handleRecipesShow,
} from '~/commands/recipes';
import {
  handleSecretsDelete,
  handleSecretsDeleteAccount,
  handleSecretsGet,
  handleSecretsSet,
} from '~/commands/secrets';
import { handleSetup } from '~/commands/setup';
import { handleVariablesGet, handleVariablesSet } from '~/commands/variables';
import { createOnePasswordStore } from '~/secrets/one-password-store';

const store = createOnePasswordStore();

const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json'
);
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  version: string;
};

const program = new Command();

program
  .name('plugga')
  .description(
    'Centralized CLI for managing service integrations and secrets across projects'
  )
  .version(version);

program
  .command('init')
  .description('Initialize Plugga and configure 1Password profile')
  .action(() => handleInit());

const recipes = program.command('recipes').description('Manage recipes');

recipes
  .command('list')
  .description('List all available recipes')
  .option('--json', 'Output machine-readable JSON')
  .action((opts) => handleRecipesList({ json: opts.json as boolean }));

recipes
  .command('add <name>')
  .description('Add a new recipe')
  .requiredOption('--type <type>', 'Recipe type: mcp or skill')
  .option('--service <service>', 'Service name (defaults to recipe name)')
  .requiredOption('--description <description>', 'Recipe description')
  .action((name: string, opts) =>
    handleRecipesAdd({
      name,
      type: opts.type as 'mcp' | 'skill',
      service: (opts.service as string | undefined) ?? name,
      description: opts.description as string,
    })
  );

recipes
  .command('show <name>')
  .description('Show recipe details')
  .option('--json', 'Output machine-readable JSON')
  .action((name: string, opts) =>
    handleRecipesShow(name, { json: opts.json as boolean })
  );

const secrets = program.command('secrets').description('Manage secrets');

secrets
  .command('set')
  .description('Store a secret for a service and account')
  .requiredOption('--service <service>', 'Service name')
  .requiredOption('--account <account>', 'Account name')
  .requiredOption('--name <name>', 'Secret name')
  .requiredOption('--value <value>', 'Secret value')
  .action((opts) =>
    handleSecretsSet(
      {
        service: opts.service as string,
        account: opts.account as string,
        name: opts.name as string,
        value: opts.value as string,
      },
      store
    )
  );

secrets
  .command('get')
  .description('Retrieve secrets for a service and account')
  .requiredOption('--service <service>', 'Service name')
  .option('--account <account>', 'Account name (uses default if omitted)')
  .option('--name <name>', 'Specific secret name')
  .option('--json', 'Output machine-readable JSON')
  .action((opts) =>
    handleSecretsGet(
      {
        service: opts.service as string,
        account: opts.account as string | undefined,
        name: opts.name as string | undefined,
        json: opts.json as boolean,
      },
      store
    )
  );

secrets
  .command('delete')
  .description('Delete a specific secret field for a service and account')
  .requiredOption('--service <service>', 'Service name')
  .requiredOption('--account <account>', 'Account name')
  .requiredOption('--name <name>', 'Secret name to delete')
  .action((opts) =>
    handleSecretsDelete(
      {
        service: opts.service as string,
        account: opts.account as string,
        name: opts.name as string,
      },
      store
    )
  );

secrets
  .command('delete-account')
  .description(
    'Delete ALL secrets for a service and account (removes the entire 1Password item)'
  )
  .requiredOption('--service <service>', 'Service name')
  .requiredOption('--account <account>', 'Account name')
  .action((opts) =>
    handleSecretsDeleteAccount(
      {
        service: opts.service as string,
        account: opts.account as string,
      },
      store
    )
  );

const variables = program.command('variables').description('Manage variables');

variables
  .command('set')
  .description('Store a variable for a service and account')
  .requiredOption('--service <service>', 'Service name')
  .requiredOption('--account <account>', 'Account name')
  .requiredOption('--name <name>', 'Variable name')
  .requiredOption('--value <value>', 'Variable value')
  .action((opts) =>
    handleVariablesSet({
      service: opts.service as string,
      account: opts.account as string,
      name: opts.name as string,
      value: opts.value as string,
    })
  );

variables
  .command('get')
  .description('Retrieve variables for a service and account')
  .requiredOption('--service <service>', 'Service name')
  .option('--account <account>', 'Account name (uses default if omitted)')
  .option('--json', 'Output machine-readable JSON')
  .action((opts) =>
    handleVariablesGet({
      service: opts.service as string,
      account: opts.account as string | undefined,
      json: opts.json as boolean,
    })
  );

program
  .command('setup <recipe>')
  .description('Set up a recipe in the current project')
  .option('--account <account>', 'Account name (uses default if omitted)')
  .option('--project-dir <dir>', 'Project directory', process.cwd())
  .action((recipeName: string, opts) =>
    handleSetup(
      {
        recipe: recipeName,
        account: opts.account as string | undefined,
        projectDir: opts.projectDir as string,
      },
      store
    )
  );

const accountsCmd = program
  .command('accounts')
  .description('Manage accounts for services');

accountsCmd
  .command('list <service>')
  .description('List all accounts for a service')
  .option('--json', 'Output machine-readable JSON')
  .action((service: string, opts) =>
    handleAccountsList(service, store, { json: opts.json as boolean })
  );

accountsCmd
  .command('show <service>')
  .description('Show default account for a service')
  .option('--json', 'Output machine-readable JSON')
  .action((service: string, opts) =>
    handleAccountsShow(service, { json: opts.json as boolean })
  );

accountsCmd
  .command('set-default <service> <account>')
  .description('Set the default account for a service')
  .action((service: string, account: string) =>
    handleAccountsSetDefault({ service, account })
  );

accountsCmd
  .command('unset-default <service>')
  .description('Remove the default account for a service')
  .action((service: string) => handleAccountsUnsetDefault(service));

accountsCmd
  .command('rename')
  .description('Rename an account for a service')
  .requiredOption('--service <service>', 'Service name')
  .requiredOption('--old-name <oldName>', 'Current account name')
  .requiredOption('--new-name <newName>', 'New account name')
  .action((opts) =>
    handleAccountsRename({
      service: opts.service as string,
      oldName: opts.oldName as string,
      newName: opts.newName as string,
    })
  );

program
  .command('install-skill')
  .description('Install or update the plugga skill globally')
  .action(() => handleInstallSkill());

program
  .command('logs')
  .description('View plugga logs')
  .option('--tail <n>', 'Show last N lines')
  .action((opts) => handleLogs({ tail: opts.tail as string | undefined }));

program.parse();
