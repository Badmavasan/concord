# Concord

Concord is a lightweight multi-user platform for systematic literature reviews: campaigns, custom annotation criteria (with per-option coding rules), BibTeX/manual paper import with mandatory PDFs, invite-based collaboration, a drag-and-drop Kanban board and inter-rater agreement statistics (Cohen's / Fleiss' kappa).

**Stack:** Node.js 22 + Express + built-in SQLite (`node:sqlite`, no native builds) · React 18 + Vite.

## Run locally

```bash
npm run install:all      # installs root, server and client deps
npm run dev              # API on :4321, Vite dev server on :5173 (proxying /api)
```

Single process serving the built React app:

```bash
npm run build && npm start   # http://localhost:4321 (PORT to change)
```

Config: see `.env.example` (`JWT_SECRET`, `PORT`, `APP_URL`, `DATA_DIR`, SMTP for emailed invites). Without SMTP, invite links are displayed in the UI to copy and share.

## Deploy on a VPS

### Docker (recommended)

```bash
git clone <repo> concord && cd concord
cp .env.example .env && nano .env        # set JWT_SECRET and APP_URL at least
mkdir -p storage import
docker compose up -d --build             # app on 127.0.0.1:4700 (HOST_PORT in .env)
```

The database and PDFs live in `./storage` (mounted at `/data`). Back that folder up.

nginx in front, with the certificate issued in two steps because the full site file names certificate files that do not exist yet:

```bash
sudo cp deploy/nginx/concord-bootstrap.conf /etc/nginx/sites-available/concord   # HTTP only
sudo ln -sf /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/concord
sudo mkdir -p /var/www/certbot && sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d concord.badmavasan.tech
sudo cp deploy/nginx/concord.conf /etc/nginx/sites-available/concord             # full HTTPS site
sudo nginx -t && sudo systemctl reload nginx
```

`deploy/nginx/concord.conf` proxies to 127.0.0.1:4700 with rate limits and 120 MB uploads; `deploy/Caddyfile` is the Caddy equivalent.

Ports: the container listens on 4321 internally and is published on `HOST_PORT` (default 4700, chosen to avoid 3000, 3001, 3100, 3300, 3301, 4000, 8080, 8090–8092 and 8181 already used on the host). Bare-metal installs read `PORT` instead. Concord needs its own hostname: it has no base-path mode, so it cannot be mounted under `/concord/` on an existing site.

### Without Docker

```bash
npm run install:all && npm run build
cp .env.example .env                     # edit
cp deploy/concord.service /etc/systemd/system/   # adjust paths/user
systemctl daemon-reload && systemctl enable --now concord
```

## Inject data from the command line

Everything the UI does for setup can be done with `server/cli.js`, which talks to the database directly (no login needed). Drop your files in `./import` (mounted read-only at `/import` inside the container).

```bash
# Docker:   docker compose exec -u node app node --no-warnings cli.js <command>
# Bare:     npm run cli -- <command>

cli.js user add you@univ.edu "Your Name" --password secret     # password is generated if omitted
cli.js user add colleague@univ.edu "Colleague"
cli.js campaign create "LLM4ED" --owner you@univ.edu --description "…"
cli.js fields import LLM4ED /import/Codebook.xlsx               # codebook or simple template
cli.js papers import-bib LLM4ED /import/papers.bib --pdf-dir /import/pdfs
cli.js papers attach-pdfs LLM4ED /import/pdfs                   # later, for papers still missing a PDF
cli.js assign LLM4ED --to you@univ.edu,colleague@univ.edu --each 2
cli.js status LLM4ED
```

`deploy/inject.sh` chains these steps; edit the variables at the top and run it once.

PDF matching for `import-bib` / `attach-pdfs`: `<bibkey>.pdf` in the PDF directory, then the BibTeX `file` field (Zotero / JabRef exports, resolved relative to the .bib), then a filename containing the title. Papers without a match are created but flagged "Missing PDF" and cannot be annotated until one is uploaded.

## Criteria spreadsheets

Two layouts are accepted by the Import button and by `fields import`:

1. **Simple template** (download from the Criteria page): columns `name, type, options, required, description, group`. Types: `text, single, multi, boolean, number, scale`. Options separated by `;`, scale options = `min; max`.
2. **Codebook** with one row per option: `Groupe | Statut | Question / Variable | Type de réponse | Option / Valeur | Logique d'annotation`. Group and question carry forward over blank cells. French type names are understood (`Choix unique`, `Choix multiple`, `Texte libre`, `Checklist`, ordinal variants). A `Choix unique + binaire` question becomes a single choice plus a yes/no companion; a free-text question with several `N …` sub-values becomes one number field each. Each option's "Logique d'annotation" is shown to annotators under that option as a coding rule.

## LLM4ED quick start

The LLM4ED codebook lives at `data/Codebook.xlsx` (French, groups A–H, ~60 criteria, one row per option with an English coding rule). It and all other review material (`data/`, `import/`, `.bib`, `.pdf`, `.xlsx`, the database and uploads) are git-ignored, so they stay on your machine and server. To set the campaign up on a fresh server:

```bash
CLI="docker compose exec -u node app node --no-warnings cli.js"     # or: CLI="npm run cli --"
$CLI user add you@univ.edu "Your Name" --password '…'
$CLI campaign create "LLM4ED" --owner you@univ.edu --description "LLM use in education: architecture, delegated tasks, evaluation rigour, AI Act risk, trustworthy AI"
$CLI fields import LLM4ED /import/Codebook.xlsx               # 60 criteria, grouped A–H, with coding rules
$CLI papers import-bib LLM4ED /import/papers.bib --pdf-dir /import/pdfs
$CLI assign LLM4ED --to you@univ.edu,colleague@univ.edu --each 2
```

Notes on how the codebook is mapped:

- Sections A–H become criterion groups, shown as headers in the criteria list, the annotation form and the agreement page.
- Every option's *Logique d'annotation* is shown under that option in the form (annotators can hide the rules once familiar).
- *D6. Données apprenant transmises* (`Choix unique + binaire`) becomes a single choice plus a yes/no "D6. RGPD/vie privée discuté".
- *F6. Échelle de l'étude* becomes two number fields, "F6. N participants" and "F6. N items/sorties évaluées".
- `Checklist` (G5) is imported as multiple choice; the 0–5 score is the number of ticked boxes.
- Nothing is marked required, because many questions are conditional ("Si experts…"). Tick *Required* on the criteria that must always be answered.
- Re-running `fields import` appends; delete the old criteria first if you re-import a revised codebook.

## Workflow

1. **Register**, then **create a campaign**. The creator is the owner.
2. **Criteria** (owner): add one at a time or import a spreadsheet. Options can carry a coding rule (`Option :: rule`).
3. **Papers** (owner): add manually (PDF required) or import BibTeX. Imported papers without a PDF are flagged and locked.
4. **Team** (owner): invite by email; invitees set a password and are added automatically.
5. **Assign** one or more annotators per paper, singly or in bulk.
6. Annotators open a paper: PDF on the left, criteria grouped by section on the right. Save drafts, then submit (required criteria validated).
7. **Board**: Kanban with default stages *To review → In progress → Reviewed → Conflict → Done*. Papers auto-advance to *In progress* on first draft and to *Reviewed* once all assignees submit.
8. **Agreement** (owner): per-criterion statistics, a disagreement list, and an Excel export of all annotations.

## Statistics per criterion type

| Type | Statistics |
|---|---|
| single / boolean / scale | answer distribution, pairwise % agreement and Cohen's κ, Fleiss' κ across all raters, interpretation (Landis & Koch) |
| multi | per-option Cohen's κ (option treated as yes/no), pairwise Jaccard overlap |
| number | mean, SD, min, max; pairwise exact agreement, mean absolute difference, Pearson r |
| text | number of filled answers, average length |

## API overview

All under `/api`, JSON, cookie-based JWT auth.

- `POST /auth/register|login|logout`, `GET /auth/me`, `GET /auth/invite/:token`, `POST /auth/invite/:token/accept`
- `GET|POST /campaigns`, `GET|PATCH|DELETE /campaigns/:id`
- `POST /campaigns/:id/invites`, `DELETE /campaigns/:id/members/:userId`
- `POST|PATCH|DELETE /campaigns/:id/stages…`, `PUT /campaigns/:id/stages/order`
- `POST /campaigns/:id/fields`, `POST /campaigns/:id/fields/import` (xlsx), `GET /campaigns/:id/fields/template.xlsx`
- `GET|POST /campaigns/:id/papers`, `POST …/papers/import-bib`, `POST …/papers/:pid/pdf`, `GET …/papers/:pid/pdf`
- `PUT …/papers/:pid/assignees`, `POST …/papers/bulk-assign`, `POST …/papers/:pid/move`
- `PUT …/papers/:pid/annotation` (`{ values, status: 'draft'|'submitted' }`)
- `GET /campaigns/:id/stats`, `GET /campaigns/:id/stats/export.xlsx`

## Security notes

- Sessions are httpOnly, SameSite=Lax cookies signed with HS256; the secret comes from `JWT_SECRET` or is generated once and stored in the data directory. Cookies get the `Secure` flag automatically when `APP_URL` is https.
- State-changing API calls must come from the app's own origin (Origin/Referer check) on top of SameSite, so cross-site forms cannot act on a logged-in session.
- Sign-in, registration and invite lookups are rate-limited per IP (20 per 15 minutes); the whole API is capped at 600 requests per minute per IP.
- Passwords are bcrypt-hashed (cost 11), minimum 8 characters; login takes the same time whether or not the account exists.
- Uploads are checked for the PDF magic bytes, stored under server-generated names, served with `nosniff`, and capped at 100 MB.
- Strict security headers (CSP allowing only self plus Google Fonts, frame-ancestors self, nosniff, referrer-policy, HSTS when on https).
- `OPEN_REGISTRATION=false` makes account creation invite-only; the first owner is created with the CLI.
- Every campaign route checks membership; owner-only routes check ownership; stats and exports are owner-only.
- The Docker image runs as the unprivileged `node` user and, by default, binds to 127.0.0.1 so only the reverse proxy can reach it.
- Dependencies audited clean (`npm audit`) at the time of writing; SheetJS is pinned to the patched 0.20.3 build from cdn.sheetjs.com.

## License

MIT. Free to use, modify and redistribute for any purpose, including commercially. See `LICENSE`.
