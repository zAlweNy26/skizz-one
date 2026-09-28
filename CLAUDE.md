# Claude instructions

## Git workflow

- **Never create git worktrees.** Work directly in the current checkout, on
  whatever branch is checked out. This applies to background jobs too: do not
  call `EnterWorktree` or `git worktree add`. `.claude/settings.json` turns
  off the background-job isolation guard (`worktree.bgIsolation: "none"`) so
  this works.
- Commit follow-up work onto the current branch. Only create a new branch when
  explicitly asked.
