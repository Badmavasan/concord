# Agreement statistics

The *Agreement* page is visible to the campaign owner and counts **submitted** annotations only. Drafts are ignored. Everything is computed on the server from the raw answers at request time; there is no cached state.

## By criterion type

| Type | What is shown |
|---|---|
| Single choice, yes/no, scale | Distribution of answers. For each pair of annotators: number of papers both submitted, raw agreement, Cohen's κ. Across all annotators: Fleiss' κ on the papers every active annotator submitted. Interpretation after Landis and Koch. Scale also shows the mean. |
| Multiple choice | For each option, Cohen's κ treating that option as chosen / not chosen, averaged over pairs. For each pair, the mean Jaccard overlap of the selected sets. |
| Number | Mean, SD, min, max. For each pair: papers in common, share with identical values, mean absolute difference, Pearson r. |
| Free text | Number of filled answers and their average length. No agreement statistic. |

## Definitions

**Cohen's κ** for a pair of annotators over the papers both submitted:

κ = (p₀ − pₑ) / (1 − pₑ), where p₀ is the observed proportion of papers on which they gave the same answer and pₑ the proportion expected by chance from each annotator's marginal distribution. Undefined (shown as —) when only one category was ever used by both.

**Fleiss' κ** across m annotators over the N papers all of them submitted, using the standard formula with per-paper agreement averaged and expected agreement from the pooled category proportions.

**Interpretation** (Landis and Koch): below 0 poor, to 0.20 slight, to 0.40 fair, to 0.60 moderate, to 0.80 substantial, above 0.80 almost perfect. The page colours κ red below 0.4, amber to 0.6, green above, and highlights values at or above 0.6.

**Jaccard overlap** between two selected sets is |A ∩ B| / |A ∪ B|, with two empty sets counting as full agreement.

## Disagreements

Below the per-criterion blocks is a list of every paper with two or more submissions where at least one choice-type criterion received different answers, with each annotator's answer. Use it to resolve conflicts, then move the paper out of the *Conflict* stage on the board.

## Export

*Export to Excel* downloads one sheet with a row per (paper, annotator) and a column per criterion; multiple-choice answers are joined with `; `. The same data is available at `GET /api/campaigns/:id/stats/export.xlsx`.
