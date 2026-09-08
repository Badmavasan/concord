# Contributing

Thanks for considering it. Concord is small on purpose; contributions that keep it simple are the most welcome.

## Reporting a problem

Open an issue with what you did, what you expected, what happened, and the version (the commit hash, or the date you pulled). For anything security-related, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Proposing a change

1. Open an issue first for anything beyond a small fix, so we can agree on the shape before you spend time on it.
2. Fork, branch from `main`, make the change.
3. Run `npm run build` and `npm test`. Add a case to `tests/e2e.mjs` for new behaviour.
4. Keep the pull request focused: one change, described in plain words, with a note on anything that affects deployment or the schema.

See [docs/development.md](docs/development.md) for how the code is organised and the conventions to follow.

## Scope

Things that fit: annotation and screening workflow, agreement statistics, import and export formats, deployment ergonomics, accessibility, translations of the interface.

Things that probably don't: a second database engine, a plugin system, features that need an external service to work.

## Licence

By contributing you agree that your contribution is licensed under the MIT licence, like the rest of the project.
