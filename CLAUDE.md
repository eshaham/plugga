# plugga

Centralized CLI for managing service integrations and secrets across projects (TypeScript + Commander, 1Password backend).

## Building and linking — always from the main checkout, never a worktree

The global `plugga` command is an `npm link` symlink. It MUST point at the main
repository checkout, not a git worktree: a worktree is ephemeral, and the moment
it is pruned the symlink dangles and `plugga` breaks (`command not found`), or —
worse — keeps resolving to a stale build with bugs already fixed on `main`.

- Build and link only from the main checkout: `npm run relink`.
- `npm run relink` refuses to run from a worktree and exits non-zero — if you hit
  that error, `cd` to the main repository and re-run it there.
- Inside a worktree you may `npm run build` for local verification, but do not
  `npm link` from it.

## Dev commands

```bash
npm run build        # bundle to dist/ (tsup)
npm run relink       # build + npm link, guarded to main checkout only
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # jest
```
