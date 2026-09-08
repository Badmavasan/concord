# Architecture

```
concord/
├── server/                 Express API, serves client/dist in production
│   ├── index.js            app setup, middleware order, static serving, error handler
│   ├── db.js               SQLite (node:sqlite), schema, migrations, DATA_DIR
│   ├── auth.js             JWT sign/verify, requireAuth / requireMember / requireOwner
│   ├── security.js         headers, same-origin check, rate limiter, secret management, input helpers
│   ├── mailer.js           SMTP transport and the three message templates
│   ├── tokens.js           hashed one-time tokens for invitations and resets
│   ├── bibtex.js           BibTeX parser
│   ├── codebook.js         spreadsheet parsers (simple template and codebook layouts)
│   ├── stats.js            Cohen's and Fleiss' kappa, Jaccard, numeric agreement
│   ├── cli.js              command-line administration
│   └── routes/             auth, campaigns (members, invites, stages), fields, papers (annotations), stats
├── client/                 React 18 + Vite
│   └── src/
│       ├── main.jsx        routes
│       ├── auth.jsx        session context
│       ├── api.js          fetch wrapper
│       ├── styles.css      the design system (tokens, components, pages)
│       ├── components/     Layout, Modal, Avatar
│       └── pages/          Login, Invite, Forgot, Reset, Dashboard, Campaign (+ tabs/), PaperView
├── tests/                  end-to-end API suite and its runner
├── deploy/                 nginx, Caddy, systemd, entrypoint, inject script
└── docs/
```

## Data model

`users`, `campaigns` (owner_id), `campaign_members` (role), `invites` (hashed token, expiry, sent_at, invited_by), `password_resets` (hashed token, expiry), `fields` (type, options JSON, option_help JSON, group_name, position, required), `stages` (position), `papers` (metadata, pdf_path, stage_id, position), `paper_assignments`, `annotations` (values JSON keyed by field id, status draft/submitted).

Foreign keys cascade: deleting a campaign removes everything in it; deleting a paper removes its assignments and annotations; deleting a criterion keeps annotation rows but its answers are no longer shown.

Migrations are additive and run at start: `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ADD COLUMN` when a column is missing.

## Request flow

`securityHeaders` → rate limiter and same-origin check on `/api` → JSON and cookie parsing → routes → 404 for unknown `/api` paths → static files and SPA fallback → error handler.

Campaign routes are mounted under `/api/campaigns/:campaignId/...` with `mergeParams`, and `requireMember` loads the campaign and the caller's role onto the request.

## Front end

No state library: each page fetches what it needs and re-fetches after mutations. The campaign page loads campaign, members, criteria and stages once and passes them to the tabs. The reader keeps annotation values in local state and sends them whole on save. Drag and drop on the board uses `@hello-pangea/dnd` with an optimistic update.

The stylesheet is hand-written: colour and type tokens at the top, then controls, then per-page sections. Two typefaces from Google Fonts with system fallbacks.

## Statistics

`stats.js` receives, per criterion, the list of `{paper_id, user_id, value}` from submitted annotations and returns a structure the page renders. Pairwise measures use only the papers both annotators submitted; Fleiss' κ uses only the papers every active annotator submitted.
