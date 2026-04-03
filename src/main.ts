#!/usr/bin/env node

import { Command } from 'commander';

import { handleLogs } from '~/commands/logs';
import { handleSecretsGet, handleSecretsSet } from '~/commands/secrets';
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

program
  .command('logs')
  .description('View plugga logs')
  .option('--tail <n>', 'Show last N lines')
  .action((opts) => handleLogs({ tail: opts.tail as string | undefined }));

program.parse();
