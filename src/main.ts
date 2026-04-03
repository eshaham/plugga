#!/usr/bin/env node

import { Command } from 'commander';

import { handleLogs } from '~/commands/logs';

const program = new Command();

program
  .name('plugga')
  .description(
    'Centralized CLI for managing service integrations and secrets across projects'
  )
  .version('0.1.0');

program
  .command('logs')
  .description('View plugga logs')
  .option('--tail <n>', 'Show last N lines')
  .action((opts) => handleLogs({ tail: opts.tail as string | undefined }));

program.parse();
