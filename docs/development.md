# Development

## Running

```bash
npm run install:all
npm run dev        # server with --watch on :4321, Vite on :5173 proxying /api
```

The server reads no `.env` by itself; export variables or start it with `node --env-file=.env --no-warnings index.js` from `server/`. Data lands in `server/data.sqlite` and `server/uploads/` (both git-ignored).

## Tests

```bash
npm test
```

`tests/run.mjs` starts a throwaway server on a temporary data directory and runs `tests/e2e.mjs` against it: registration, invitations, resend, forgot and reset, criteria import from the template, BibTeX import, PDF checks, assignment, annotation validation, automatic stage moves, kappa values, permission checks, bulk PDF matching, editing and ownership transfer. Run it against a live server with `CONCORD_URL=http://localhost:4321 LOG=<server log> node tests/e2e.mjs` (it needs a fresh database, because it registers fixed test accounts).

There is no CI configured; run the suite locally before pushing.

## Conventions

- Plain JavaScript, ES modules, no build step for the server.
- Every route that touches a campaign goes through `requireMember`; owner-only routes add `requireOwner`.
- Text from clients passes through `str()` in `security.js` (trim, strip control characters, cap length).
- Schema changes are additive and go in `db.js` as `ALTER TABLE ... ADD COLUMN` guarded by a column check.
- UI copy is plain, sentence case, and says what happens ("Send invitation", not "Submit").
- The stylesheet is organised by tokens, controls, then pages; prefer a class in `styles.css` over inline style objects when the same look is used twice.

## Adding a criterion type

1. `codebook.js`: `mapType` and, if needed, how options are parsed.
2. `routes/fields.js`: `normalizeField` (validation of options) and `routes/papers.js`: `validate` (validation of answers).
3. `client/src/pages/PaperView.jsx`: the input in `Question`.
4. `stats.js`: what to compute, and `client/src/pages/tabs/StatsTab.jsx`: how to show it.
5. `tests/e2e.mjs`: a case.
