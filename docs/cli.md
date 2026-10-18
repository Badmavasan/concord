# Command line

`server/cli.js` talks to the database directly, so it needs no login and works whether or not the server is running. Use it to set up a campaign from files in one go, to fix accounts, or to check state.

```bash
# Docker (files under ./import are visible at /import inside the container)
docker compose exec -u node app node cli.js <command>
# Bare install
npm run cli -- <command>
```

`<campaign>` is a campaign id or its exact name.

## Commands

```
user add <email> <name> [--password X]          create an account (password generated and printed if omitted)
user password <email> <newPassword>             reset someone's password
campaign create "<name>" --owner <email> [--description "..."]
campaign list
fields import <campaign> <file.xlsx> [--only <name prefix>]   criteria from the simple template or a codebook (see criteria.md);
                                                --only adds just the matching criteria; the campaign is re-sorted to the file's order
fields delete <campaign> "<criterion name>"      remove one criterion (answers given for it are no longer shown)
fields sync <campaign> <codebook.json> [--dry-run]   apply a codebook JSON to an existing campaign (see below)
members add <campaign> <email> [<email>...]     add existing accounts as annotators
papers import-bib <campaign> <refs.bib> [--pdf-dir <dir>]
papers attach-pdfs <campaign> <dir>             attach PDFs to papers still missing one
papers add <campaign> --title ".." --pdf file.pdf [--authors ..] [--year ..] [--venue ..] [--doi ..] [--key ..]
assign <campaign> --to a@x.org,b@x.org [--each N] [--unassigned-only]
status <campaign>
mail test [address]                             check SMTP settings; with an address, send a real message
```

## Revising a codebook on a live campaign

`fields sync` applies a codebook JSON to a campaign that may already hold annotations, and migrates the answers instead of losing them. Always run it with `--dry-run` first: it prints every change and writes nothing.

| In the JSON | Effect on the campaign |
|---|---|
| `previous_name` / `previous_names` on a question | the question is renamed (every earlier name is tried, which covers renumbered groups) |
| `previous_value` on an option | the option is renamed and answers follow; two options sharing a `previous_value` split one option into two, and answers get both |
| `removed_options` with `moved_to` | the option is dropped and its answers move to the named option of another question |
| `previous_type: "free_text"` with `match` keywords on options | the question becomes a list; earlier texts are converted by keyword, and what is not recognised goes under the *Autre* option with its text |
| `previous_type: "yes_no"` with `from_bool` on options | a yes/no question becomes a choice; earlier true and false answers become the marked options |
| `removed` | the question is deleted (the number of answers no longer shown is reported) |
| a question absent from the campaign | it is added at its place |
| `allows_text`, `checkboxes` | text boxes on options and checkboxes under text answers |
| `general_rules`, group `description` | campaign guidelines and section descriptions |

Questions are matched by name, order follows the file, and questions of the campaign that the file does not mention are kept at the end. Running it twice changes nothing the second time.

## PDF matching

`papers import-bib` and `papers attach-pdfs` look for a PDF in this order:

1. `<citation key>.pdf` in the given directory.
2. For `import-bib`, the BibTeX `file` field (Zotero and JabRef exports), resolved relative to the `.bib` file.
3. A filename that contains the paper title.

Papers with no match are created anyway and flagged *Missing PDF*; attach the PDF later with `attach-pdfs`, by dragging it onto the Papers page, or from the paper's Edit dialog.

## Assignment

`assign` distributes papers round-robin over the listed people, `--each N` per paper (default: everyone on every paper). `--unassigned-only` leaves papers that already have annotators alone. People are added to the campaign if they are not members yet.

## A whole setup in one script

`deploy/inject.sh` chains the commands above. Edit the variables at its top (owner, campaign name, codebook, `.bib`, PDF folder, annotators) and run it once:

```bash
bash deploy/inject.sh
```
