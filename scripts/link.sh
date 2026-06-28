#!/usr/bin/env bash
set -euo pipefail

toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "error: not inside a git repository." >&2
  exit 1
}

if [ -f "$toplevel/.git" ]; then
  echo "error: refusing to build/link from a git worktree:" >&2
  echo "  $toplevel" >&2
  echo >&2
  echo "The global 'plugga' link must point at the main checkout. Linking from a" >&2
  echo "worktree leaves a dangling symlink (and a broken 'plugga' command) the" >&2
  echo "moment that worktree is pruned. Run this from the main repository instead." >&2
  exit 1
fi

npm run build
npm link

echo "Linked 'plugga' from main checkout: $toplevel"
