# Features

## Campaigns

- Any number of campaigns per instance; each user sees the ones they belong to.
- One owner per campaign, with full control; other members are annotators.
- Ownership transfer to any member (the former owner stays as an annotator).
- Settings page for the owner: rename, edit the description, and delete the campaign after typing its name; deletion removes papers, PDFs, criteria, assignments, annotations and invitations.

## Criteria

- Answer types: single choice, multiple choice, yes/no, scale (min to max), number, free text.
- Optional section (group) per criterion; sections appear as headers in the form and in statistics.
- Optional guidance text per criterion and a coding rule per option, shown to annotators (with a toggle to hide the rules once familiar).
- Required flag, enforced at submission.
- Options that take a text: any option named *Autre* or *Other* opens a text box when chosen, and any other option can be marked `[texte]` to do the same. The text is required to mark the annotation as done, appears in the export, and is listed by frequency in the statistics so recurring values can become options.
- Checkboxes under a text or number answer, each with its own meaning, such as *Non standardisé* or *Non concerné*. Ticking one counts as an answer; an exclusive box also clears and disables the text.
- Annotation guidelines per campaign, shown at the top of every annotation form, and a description per section shown under its header.
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
- Reader with the PDF pinned beside a scrolling form; a draggable divider sets how much room the form gets (arrow keys on the handle, double-click to reset) and the choice is remembered per browser.
- Answers are saved to the database automatically as they are given (and flushed when the page is left), so nothing is lost by navigating away. *Mark as done* is the explicit validation step: required criteria and option values are checked, the annotation counts in statistics, and the paper advances on the board. A done annotation is shown read-only with *Edit answers*, *Save changes* and *Cancel*.
- Owner view of all annotators' answers on a paper.
- Annotation locked while a paper has no PDF.
- An optional comment under every criterion, to justify an answer or point to the evidence. Comments are saved with the answers, shown with colleagues' answers and in the disagreement list, and exported in a *comments* column.
- *Mark as done* first lists the criteria still unanswered in a pop-up, each linking to its question, with *Keep annotating* or *Mark as done anyway*. Validation problems (an *Autre* without its text, for instance) are explained in a pop-up too; the answers are saved either way.

## Board

- Kanban with drag and drop between and within stages.
- Default stages: To review, In progress, Reviewed, Conflict, Done. Add, rename, reorder, delete.
- Automatic moves: first draft to *In progress*, all submitted to *Reviewed*.
- Cards show assignees with their status, submission count, and a missing-PDF badge. Filter to your own papers.

## Results and agreement statistics

- Open to the owner, for every paper, and to every annotator, for exactly the papers they have marked as done. Nobody sees colleagues' answers on a paper before giving their own, so the agreement figures stay meaningful.
- The same rule applies inside a paper: once your annotation is done, colleagues' submitted answers and comments appear under the form.
- Global results across all visible papers, or results for a chosen set: a paper picker with search, quick filters (2+ annotators, done by me, selected) and a stage filter. The choice is remembered per campaign, applies to the export, and the owner can jump to it from a selection on the Papers page.

- Per criterion: distribution, pairwise raw agreement and Cohen's kappa, Fleiss' kappa across all raters, Landis and Koch interpretation.
- Multiple choice: per-option kappa treating each option as yes/no, plus Jaccard overlap per pair.
- Numbers: mean, SD, range, pairwise exact agreement, mean absolute difference, Pearson correlation.
- Free text: fill count and average length.
- Disagreement list per paper and criterion, with comments.
- Excel export of the visible, or selected, submitted annotations.

## Administration

- Command-line tool for users, campaigns, criteria import, BibTeX and PDF import, assignment and status ([details](cli.md)).
- Single `.env` for all configuration, including SMTP.
- Docker image, compose file, nginx and Caddy configs, systemd unit ([deployment](deployment.md)).
