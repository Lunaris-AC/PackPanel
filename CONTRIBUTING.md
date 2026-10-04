# Contributing

Use Node.js 24. From the repository root, run `npm ci`, `npm run build`, `npm test` and `npm audit --audit-level=low`. Keep the single root lockfile; do not add workspace lockfiles or built archives.

For a pull request, explain the affected behavior and include relevant validation. Report Minecraft and loader versions for catalog/runtime problems. Launcher changes should be checked using a generated, downloaded executable, including a second launch after an update. Use separate database/storage for integration fixtures; never run destructive checks against a live player pack.

Panel text lives in `frontend/src/i18n`: existing navigation dictionaries and source-message pairs `[French, English]`. Add both languages, retain substitution placeholders, and check language switching and persisted preferences. User-provided names, paths and pack descriptions should be preserved. The unit suite checks dictionary coverage and API-error translation; `scripts/check-panel-languages.cjs` exercises the actual browser workflow.

Keep `.env`, tokens, passwords, private logs, backups and player data out of commits and issues. For security issues, follow [SECURITY.md](SECURITY.md). The current desktop validation scope is Windows x64 with offline authentication; identify other platforms as unverified until tested.
