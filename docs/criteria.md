# Criteria spreadsheets

Criteria can be added one at a time in the UI or imported from a spreadsheet (`.xlsx`, `.xls` or `.csv`), through the *Import Excel* button or `cli.js fields import`. The first sheet is read and the layout is detected from the header row. Import appends; delete existing criteria first if you re-import a revised file.

## Layout 1: simple template

One row per criterion. Download it from the Criteria page.

| name | type | options | required | description | group |
|---|---|---|---|---|---|
| Include? | boolean | | yes | Should this paper be included? | Screening |
| Study type | single | RCT; Cohort; Case-control; Other | yes | | Screening |
| Outcomes reported | multi | Mortality; Quality of life; Cost | no | Select all that apply | Extraction |
| Sample size | number | | no | | Extraction |
| Quality (1-5) | scale | 1; 5 | yes | 1 = very low, 5 = very high | Extraction |
| Notes | text | | no | | Extraction |

- `type`: `text`, `single`, `multi`, `boolean`, `number`, `scale`.
- `options`: separated by `;`, `|` or new lines. For `scale`, the minimum and maximum.
- `required`: empty means yes; otherwise `yes/no`, `true/false`, `1/0`.
- `group` (or `section`): optional.

## Layout 2: codebook, one row per option

For codebooks written the way research groups usually write them, with the coding rule for each option next to it:

| Groupe | Statut | Question / Variable | Type de réponse | Option / Valeur | Logique d'annotation |
|---|---|---|---|---|---|
| A : Design | | Study design | Choix unique | RCT | Participants allocated at random |
| | | | | Cohort | Followed over time without allocation |
| | | Outcomes | Choix multiple | Mortality | Any death outcome |
| | | | | Cost | Any economic outcome |
| | | Sample size | Texte libre | | Number of participants analysed |

Column names are matched loosely (a column starting with "group", one containing "question", one starting with "type", one starting with "option", and one containing "logique", "logic", "guidance" or "when"). Group and question carry forward over blank cells.

Type names understood, in French or English: `Choix unique` / `single` (also the ordinal variants), `Choix multiple` / `multi` / `Checklist`, `Texte libre` / `text`, `Nombre` / `number`, `Binaire` / `boolean`, `Échelle` / `scale`.

Special cases:

- `Choix unique + binaire`: the options starting with `+` become a separate yes/no criterion placed next to the main one.
- A free-text question whose sub-values all start with `N ` (for instance "N participants", "N items") becomes one number criterion per sub-value.
- A free-text question with several described sub-values keeps them as guidance text.
- Each option's coding rule is stored and shown under that option in the annotation form.

Nothing is marked required on import, because codebooks often contain conditional questions. Tick *Required* on the ones that must always be answered.

## Coding rules in the UI

When adding or editing a criterion in the UI, write one option per line, and put a coding rule after two colons:

```
Cohort study :: participants followed over time without random allocation
Case report
```
