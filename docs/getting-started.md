# Getting started

This walks through one review from an empty instance to exported results. It assumes Concord is running, locally with `npm run dev` or on a server as described in [deployment](deployment.md).

## 1. Create an account

Open the sign-in page and choose *Create an account*. If the administrator has set `OPEN_REGISTRATION=false`, accounts are created only through invitation links or the [command line](cli.md).

## 2. Start a campaign

From *Your reviews*, click *New campaign*. Give it a name and, optionally, the research question. You are its owner: only you can change criteria, papers, stages and assignments, and only you see the agreement statistics. Ownership can be handed to another member later from the Team page.

## 3. Define the criteria

The *Criteria* page holds the questions every annotator answers for every paper. Add them one at a time, or import a spreadsheet: the simple template (download it from the page) or a full codebook with one row per option. See [criteria spreadsheets](criteria.md) for both layouts.

Each criterion has an answer type, an optional section, optional guidance, and for choice types a list of options. Each option can carry a coding rule, shown under the option while annotating. Mark a criterion *Required* to block submission until it is answered.

## 4. Add the papers

On the *Papers* page you can:

- **Drag a `.bib` file** onto the page. Entries are imported; duplicate citation keys are skipped.
- **Import BibTeX** through the button, from a file or pasted text.
- **Add a paper** by hand, with its PDF.

Papers imported from BibTeX have no PDF yet and are flagged *Missing PDF*. Attach PDFs by dragging them onto the page: a file named after the citation key (`smith2020.pdf`) attaches to that paper, otherwise a filename containing the title is matched. Or use *Edit* on the row to upload one. Annotation stays locked until the PDF is there.

## 5. Build the team

On the *Team* page, enter a colleague's address and send an invitation. Someone new receives an email with a link to choose a password; it works once and expires after 24 hours, and you can resend it. Someone who already has an account is added immediately and told by email.

Without SMTP configured, the invitation link is shown to you to pass on by hand.

## 6. Assign papers

On each paper row, *Assign* opens the list of members; tick as many as you like. To assign many papers at once, tick their checkboxes and use *Assign annotators*, choosing whether to add to or replace the current assignees. Two or more annotators on the same paper is what makes agreement statistics possible.

Annotators see what is theirs under the *Mine* filter and on *Your reviews* as "n waiting for you".

## 7. Annotate

Open a paper. The PDF is on the left, the criteria on the right, grouped by section. *Save draft* keeps work in progress; *Submit* checks the required criteria and records the answers. A submitted annotation can still be updated.

The owner can also open any paper and see everyone's answers side by side.

## 8. Follow up on the board

The *Board* shows every paper as a card in a stage. Default stages are *To review*, *In progress*, *Reviewed*, *Conflict* and *Done*; the owner can add, rename, reorder and delete stages. Papers move to *In progress* when someone saves a first draft and to *Reviewed* when every assignee has submitted. Drag cards to move them by hand, for instance into *Conflict* while you resolve a disagreement.

## 9. Read the agreement

The *Agreement* page (owner only) shows, for every criterion, the distribution of answers and the agreement between annotators: Cohen's kappa for each pair, Fleiss' kappa across everyone, and interpretation. Below is the list of every paper where annotators disagreed, with each person's answer. *Export to Excel* downloads every submitted annotation as one sheet, one row per paper and annotator. See [statistics](statistics.md) for what is computed.
