# Security

Concord is meant to be exposed on the internet by a small research group behind a reverse proxy. This is what it does to stay safe, and what is expected of the operator.

## Accounts and sessions

- Passwords are bcrypt-hashed (cost 11), minimum 8 characters. Sign-in takes the same time whether or not the account exists.
- Sessions are httpOnly, SameSite=Lax cookies carrying a signed JWT (HS256, 30 days) with only the user id. The secret comes from `JWT_SECRET` or is generated once and stored in the data directory with mode 600.
- Cookies are marked Secure when `APP_URL` is https (or `COOKIE_SECURE=true`), and HSTS is sent in that case.
- Changing a password invalidates every session token issued before the change.
- Registration can be limited to invitations with `OPEN_REGISTRATION=false`.

## Invitations and resets

- Tokens are 256-bit random values; only their SHA-256 hash is stored. They are single-use and expire after `LINK_TTL_HOURS` (24 by default).
- The forgot-password route returns the same response for known and unknown addresses.
- An invitation can only be accepted by the address it was sent to.

## Request handling

- Every non-GET API request must carry an Origin or Referer that matches the host, on top of SameSite cookies, so cross-site forms cannot act on a session.
- Sign-in, registration, forgot/reset and invitation lookups are limited to 20 per 15 minutes per IP; the whole API to 600 per minute per IP. The nginx site adds an outer limit.
- JSON bodies are capped at 1 MB, annotations at 200 KB, and every text field at a fixed length with control characters stripped.
- Malformed JSON, oversized uploads and multer errors return 400; unexpected errors return a generic message in production and are logged server-side.
- `x-powered-by` is removed. Headers sent on every response: a Content-Security-Policy allowing only the app's origin plus Google Fonts, `frame-ancestors 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, a restrictive `Permissions-Policy`, and `Cache-Control: no-store` on the API.

## Uploads

- Only PDFs: the first bytes must be `%PDF-`, regardless of the declared type or extension. Up to 100 MB.
- Files are stored under server-generated names; the original name is sanitised for display and download. Served with `nosniff` and only to members of the campaign.
- Spreadsheets and BibTeX are parsed in memory and never stored.

## Authorisation

- Every campaign route checks membership; owner-only routes (criteria, papers, stages, assignments, invitations, transfer, statistics, export) check ownership.
- Annotation is only possible for assigned members (and the owner), and only once the paper has a PDF.
- Ownership transfer requires the current owner and a target who is already a member.

## Deployment

- The Docker image runs as the unprivileged `node` user and, by default, publishes on 127.0.0.1 so only the reverse proxy can reach it.
- SQLite in WAL mode with foreign keys enforced; no network database to secure.
- Dependencies are audited with `npm audit`; SheetJS is pinned to the maintained build from cdn.sheetjs.com because the npm package is unpatched.

## What the operator must do

- Set `APP_URL` to the public https URL and keep `JWT_SECRET` (or the generated file) private.
- Terminate TLS at the proxy and forward `X-Forwarded-Proto` and `X-Forwarded-Host`.
- Back up the data directory. Uploaded PDFs are copyrighted material; keep the instance private to the team.
- Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
