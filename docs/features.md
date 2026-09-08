# Features

## Campaigns

- Any number of campaigns per instance; each user sees the ones they belong to.
- One owner per campaign, with full control; other members are annotators.
- Ownership transfer to any member (the former owner stays as an annotator).
- Campaign name and description editable by the owner; deletion removes everything in it.

## Criteria

- Answer types: single choice, multiple choice, yes/no, scale (min to max), number, free text.
- Optional section (group) per criterion; sections appear as headers in the form and in statistics.
- Optional guidance text per criterion and a coding rule per option, shown to annotators (with a toggle to hide the rules once familiar).
- Required flag, enforced at submission.
- Reordering with arrows; editing and deletion at any time.
- Spreadsheet import: simple template or codebook layout, French and English type names ([details](criteria.md)).
- Downloadable Excel template.

## Papers

- Manual entry with mandatory PDF.
- BibTeX import from a file, pasted text, or drag and drop; nested braces, quoted values and `@comment` entries handled; authors, year, venue, DOI and abstract extracted; duplicate citation keys skipped.
- Bulk PDF attachment by drag and drop, matched by citation key then by title; command-line equivalent for whole folders and for BibTeX `file` fields from Zotero or JabRef.
- PDFs verified by magic bytes, stored under server-generated names, served only to campaign members.
- Editing of every field and PDF replacement after creation.
- Filters: all, mine, unassigned, missing PDF. Bulk selection for assignment.

## Team and accounts

- Self-registration (can be disabled) and invitation by email.
- Invitations: one-time 24-hour links leading to a choose-a-password page; resend and revoke; existing accounts added immediately.
- Forgot-password flow with one-time links; changing a password signs out other sessions.
- Member removal clears their assignments and keeps their submitted answers.

## Assignment and annotation

- One or several annotators per paper; single-row or bulk assignment with add or replace modes.
- Reader with the PDF pinned beside a scrolling form; drafts and submissions; validation of required fields and option values.
- Owner view of all annotators' answers on a paper.
- Annotation locked while a paper has no PDF.

## Board

- Kanban with drag and drop between and within stages.
- Default stages: To review, In progress, Reviewed, Conflict, Done. Add, rename, reorder, delete.
- Automatic moves: first draft to *In progress*, all submitted to *Reviewed*.
- Cards show assignees with their status, submission count, and a missing-PDF badge. Filter to your own papers.

## Agreement statistics

- Per criterion: distribution, pairwise raw agreement and Cohen's kappa, Fleiss' kappa across all raters, Landis and Koch interpretation.
- Multiple choice: per-option kappa treating each option as yes/no, plus Jaccard overlap per pair.
- Numbers: mean, SD, range, pairwise exact agreement, mean absolute difference, Pearson correlation.
- Free text: fill count and average length.
- Disagreement list per paper and criterion.
- Excel export of all submitted annotations.

## Administration

- Command-line tool for users, campaigns, criteria import, BibTeX and PDF import, assignment and status ([details](cli.md)).
- Single `.env` for all configuration, including SMTP.
- Docker image, compose file, nginx and Caddy configs, systemd unit ([deployment](deployment.md)).
