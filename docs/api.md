# API

All routes are under `/api`, speak JSON, and use the session cookie set at sign-in. Errors are `{ "error": "message" }` with an appropriate status; validation errors on submission add `field_errors: { fieldId: "message" }`.

## Authentication

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{ email, name, password }`. 403 when `OPEN_REGISTRATION=false`. |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| GET | `/auth/me` | current user |
| GET | `/auth/config` | `{ openRegistration, mailEnabled }` |
| GET | `/auth/invite/:token` | invitation details: email, campaign, inviter, expired, existingUser |
| POST | `/auth/invite/:token/register` | `{ name, password }`: create the account and join |
| POST | `/auth/invite/:token/accept` | signed-in user with the invited address joins |
| POST | `/auth/forgot` | `{ email }`; same response whether or not the address exists |
| GET | `/auth/reset/:token` | validity check |
| POST | `/auth/reset/:token` | `{ password }`; sets it, signs in, invalidates other sessions |

## Campaigns

| Method | Path | Who |
|---|---|---|
| GET | `/campaigns` | member: list with counts and "waiting for you" |
| POST | `/campaigns` | `{ name, description }` |
| GET | `/campaigns/:id` | member: campaign, members, fields, stages |
| PATCH | `/campaigns/:id` | owner |
| DELETE | `/campaigns/:id` | owner: `{ confirm: <campaign name> }`; removes PDF files too |
| POST | `/campaigns/:id/transfer` | owner: `{ user_id }` |
| POST | `/campaigns/:id/invites` | owner: `{ email }` → `{ added, emailed, link?, expires_at }` |
| GET | `/campaigns/:id/invites` | owner: pending invitations |
| POST | `/campaigns/:id/invites/:inviteId/resend` | owner |
| DELETE | `/campaigns/:id/invites/:inviteId` | owner |
| DELETE | `/campaigns/:id/members/:userId` | owner |
| POST | `/campaigns/:id/stages` | owner: `{ name }` |
| PATCH | `/campaigns/:id/stages/:stageId` | owner: `{ name }` |
| PUT | `/campaigns/:id/stages/order` | owner: `{ order: [ids] }` |
| DELETE | `/campaigns/:id/stages/:stageId` | owner |

## Criteria

| Method | Path | Who |
|---|---|---|
| POST | `/campaigns/:id/fields` | owner: `{ name, type, options, option_help, required, description, group_name }` |
| PATCH | `/campaigns/:id/fields/:fieldId` | owner |
| PUT | `/campaigns/:id/fields/order` | owner: `{ order }` |
| DELETE | `/campaigns/:id/fields/:fieldId` | owner |
| POST | `/campaigns/:id/fields/import` | owner: multipart `file` (xlsx/xls/csv) → `{ created, errors }` |
| GET | `/campaigns/:id/fields/template.xlsx` | member |

## Papers

| Method | Path | Who |
|---|---|---|
| GET | `/campaigns/:id/papers` | member: with assignees, statuses, has_pdf |
| POST | `/campaigns/:id/papers` | owner: multipart with metadata and `pdf` (required) |
| POST | `/campaigns/:id/papers/import-bib` | owner: multipart `file` or field `text` → `{ created, skipped }` |
| POST | `/campaigns/:id/papers/attach-pdfs` | owner: multipart `pdfs[]` → `{ attached, unmatched, rejected }` |
| POST | `/campaigns/:id/papers/bulk-assign` | owner: `{ paper_ids, user_ids, mode: "add" \| "replace" }` |
| GET | `/campaigns/:id/papers/:pid` | member: paper, own annotation, all annotations for the owner |
| PATCH | `/campaigns/:id/papers/:pid` | owner: metadata |
| DELETE | `/campaigns/:id/papers/:pid` | owner |
| POST | `/campaigns/:id/papers/:pid/pdf` | owner: multipart `pdf` |
| GET | `/campaigns/:id/papers/:pid/pdf` | member: the file |
| PUT | `/campaigns/:id/papers/:pid/assignees` | owner: `{ user_ids }` |
| POST | `/campaigns/:id/papers/:pid/move` | member: `{ stage_id, position }` |
| PUT | `/campaigns/:id/papers/:pid/annotation` | assignee or owner: `{ values, status: "draft" \| "submitted" }` |

## Statistics

| Method | Path | Who |
|---|---|---|
| GET | `/campaigns/:id/stats` | owner: summary, per-criterion statistics, conflicts |
| GET | `/campaigns/:id/stats/export.xlsx` | owner |

## Other

`GET /api/health` → `{ ok, mailEnabled }`.
