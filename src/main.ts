#!/usr/bin/env node

import { Command } from 'commander';

import {
  handleAccountsRename,
  handleAccountsSetDefault,
  handleAccountsShow,
} from '~/commands/accounts';
import { handleLogs } from '~/commands/logs';
import { handleSecretsGet, handleSecretsSet } from '~/commands/secrets';
import { handleVariablesGet, handleVariablesSet } from '~/commands/variables';
import { createOnePasswordStore } from '~/secrets/one-password-store';

const store = createOnePasswordStore();

const program = new Command();

program
  .name('plugga')
  .description(
    'Centralized CLI for managing service integrations and secrets across projects'
  )
  .version('0.1.0');

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
  .action((opts) =>
    handleSecretsGet(
      {
        service: opts.service as string,
        account: opts.account as string | undefined,
        name: opts.name as string | undefined,
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
  .action((opts) =>
    handleVariablesGet({
      service: opts.service as string,
      account: opts.account as string | undefined,
    })
  );

const accountsCmd = program
  .command('accounts')
  .description('Manage accounts for services');

accountsCmd
  .command('show <service>')
  .description('Show default account for a service')
  .action((service: string) => handleAccountsShow(service));

accountsCmd
  .command('set-default <service> <account>')
  .description('Set the default account for a service')
  .action((service: string, account: string) =>
    handleAccountsSetDefault({ service, account })
  );

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
  .command('logs')
  .description('View plugga logs')
  .option('--tail <n>', 'Show last N lines')
  .action((opts) => handleLogs({ tail: opts.tail as string | undefined }));

program.parse();
