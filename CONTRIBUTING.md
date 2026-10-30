# Contributing

## Commit Standards & Git Hooks

After cloning, activate the local git config and commit hooks once:

```bash
./scripts/setup-hooks.sh
```

This enforces conventional commit messages (`<type>(<scope>): <subject>`), blocks trailing whitespace, caps commits at 5 staged files (excluding lockfiles and docs), and rejects commits that mix build configuration with application source. See `AGENTS.md` for the full contract and allowed scopes. Existing hooks are preserved as `<hook>.local` and still run.
