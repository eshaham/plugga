#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("plugga")
  .description(
    "Centralized CLI for managing service integrations and secrets across projects",
  )
  .version("0.1.0");

program.parse();
