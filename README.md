# Plugga

Centralized CLI for managing service integrations and secrets across projects. Plugga makes AI coding environments better by configuring MCP servers and skills with credentials managed through 1Password.

## Concepts

- **Profiles** map to a 1Password account + vault. Configured during `plugga init`.
- **Services** are namespaces for credentials, implicitly created on first `secrets set` or `variables set`.
- **Secrets** are sensitive values stored in 1Password, scoped to service + account.
- **Variables** are non-sensitive config stored locally, scoped to service + account.
- **Recipes** define integrations. Type `mcp` configures MCP servers; type `skill` installs markdown instructions for Claude.
- **Accounts** are named identifiers (e.g., `personal`, `acme`) with configurable defaults per service.

## Installation

```bash
npm install -g plugga
```

## Getting Started

```bash
plugga init
```

This walks you through selecting a 1Password account and vault, creating a profile, and optionally installing the plugga skill globally.

## Commands

### Init

```bash
plugga init                     # Configure 1Password profile, install meta-skill
```

### Recipes

```bash
plugga recipes list             # List all recipes
plugga recipes add <name> \
  --type <mcp|skill> \
  --service <service> \
  --description <desc>          # Create a new recipe
plugga recipes show <name>      # Show recipe details as JSON
```

### Secrets

```bash
plugga secrets set \
  --service <s> --account <a> \
  --name <n> --value <v>        # Store a secret in 1Password

plugga secrets get \
  --service <s> \
  [--account <a>] \
  [--name <n>]                  # Retrieve secrets
```

### Variables

```bash
plugga variables set \
  --service <s> --account <a> \
  --name <n> --value <v>        # Store a local variable

plugga variables get \
  --service <s> \
  [--account <a>]               # Retrieve variables
```

### Accounts

```bash
plugga accounts show <service>                  # Show default account
plugga accounts set-default <service> <account> # Set default account
plugga accounts rename \
  --service <s> --old-name <o> --new-name <n>   # Rename an account
```

### Setup

```bash
plugga setup <recipe> [--account <a>] [--project-dir <d>]
```

Sets up a recipe in the current project:

**MCP recipes** provision a server entry into `.claude/settings.local.json`:

- `stdio` transport maps secrets to environment variables
- `sse` transport injects secrets into request headers
- `http` transport merges static headers with secret-based headers

**Skill recipes**:

1. Check if the recipe's CLI tool is installed (with install hints if missing)
2. Copy `SKILL.md` to `.claude/skills/<recipe>/SKILL.md`
3. Generate `.claude/skills/<recipe>/context.md` with account-specific variables and secret mappings
4. Write secrets as environment variables to `.env`
5. Warn if `.env` is not in `.gitignore`

### Logs

```bash
plugga logs [--tail <n>]        # View plugga logs
```

## Recipe Format

Recipes live in `~/.config/plugga/recipes/<name>/recipe.json`.

### MCP Recipe (stdio)

```json
{
  "name": "linear",
  "service": "linear",
  "type": "mcp",
  "description": "Linear MCP server",
  "secrets": [{ "name": "api-key", "envVar": "LINEAR_API_KEY" }],
  "mcp": {
    "transport": "stdio",
    "command": "npx",
    "args": ["@anthropic/linear-mcp"]
  }
}
```

### MCP Recipe (sse)

```json
{
  "name": "linear-hosted",
  "service": "linear",
  "type": "mcp",
  "description": "Linear hosted MCP",
  "secrets": [
    { "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }
  ],
  "mcp": {
    "transport": "sse",
    "url": "https://mcp.linear.app/sse"
  }
}
```

### MCP Recipe (http)

```json
{
  "name": "linear-http",
  "service": "linear",
  "type": "mcp",
  "description": "Linear HTTP MCP",
  "secrets": [
    { "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }
  ],
  "mcp": {
    "transport": "http",
    "url": "https://mcp.linear.app",
    "headers": { "X-Workspace": "default" }
  }
}
```

### Skill Recipe

```json
{
  "name": "google-maps",
  "service": "google-maps",
  "type": "skill",
  "description": "Google Maps via goplaces CLI",
  "secrets": [{ "name": "api-key", "envVar": "GOOGLE_MAPS_API_KEY" }],
  "variables": [{ "name": "profile", "description": "gog profile name" }],
  "cli": {
    "command": "goplaces",
    "source": "https://github.com/steipete/goplaces",
    "install": "brew install steipete/tap/goplaces"
  }
}
```

Skill recipes can include a `SKILL.md` file alongside `recipe.json` with markdown instructions that get copied into the project.

## File Structure

```
~/.config/plugga/
  config.json          # Profiles and tag config
  accounts.json        # Default account per service
  variables.json       # Non-sensitive per-service config
  logs/plugga.log      # Action and error logs
  recipes/
    <name>/
      recipe.json      # Recipe configuration
      SKILL.md         # Skill content (skill type only)
```

## 1Password Integration

Plugga uses the 1Password CLI (`op`) to store and retrieve secrets:

- Each profile maps to a 1Password account + vault
- Secrets are stored as concealed fields within items named `<service>/<account>`
- Items are tagged with a configurable tag (default: `plugga`) and the service name
- Multiple profiles support consultants with access to different 1Password accounts

## Development

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
```
