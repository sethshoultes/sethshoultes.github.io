# Post Ideas Backlog

The daily blog workflow reads this file, picks the first idea with `status: ready`, drafts a post in a rotated voice, and marks the idea `status: consumed` after publish.

When this file is empty (no `status: ready` ideas), the workflow generates a fresh idea from recent commits + memory themes — but a curated backlog produces better posts. Add ideas here as they come up.

## Format

Each idea is a `## Idea: <slug>` heading followed by:
- `status: ready | consumed | draft | skipped`
- `claim: <one-sentence thesis the post must defend>`
- `notes: <optional context, links, source material — anything the writer should know>`

The `slug` becomes the post filename: `_posts/YYYY-MM-DD-<slug>.html`.

---

<!-- Add ideas below. Example:

## Idea: the-validator-as-guardrail
status: ready
claim: A validator with teeth is worth more than a memory note with the same advice.
notes: The Markup Discipline memory existed and still got ignored. The fix wasn't more memory; it was a CI gate that blocks the bad commit. Reference: the daily-blog workflow added 2026-05-03.

-->
