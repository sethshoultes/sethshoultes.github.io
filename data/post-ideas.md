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

## Idea: the-validator-with-teeth
status: consumed
claim: A guardrail that lives in memory is advice; a guardrail that lives in CI is law.
notes: A markup-discipline memory entry existed for weeks warning agents not to emit doubled-prefix tag corruption like `<<pp>` and `<<imgimg>`. The corruption shipped to production anyway — three blog posts on main with literal `<<pp>` text rendering. The fix wasn't more memory. The fix was a validator wired into the publish pipeline that exits non-zero on `<<[a-z]` patterns. Memory tells the agent what should be true; the validator decides what gets shipped. The post should sit with the discomfort that comes from realizing a memory note is a hope, not a constraint.

## Idea: skipping-is-a-feature
status: consumed
claim: The most reliable feature of an autonomous pipeline is the one that doesn't run.
notes: The daily-blog workflow checks for an existing post for today's date before it does anything. If a post is already there — published by hand, by an earlier run, by a partial recovery — it exits 2 and stops. No double-post, no clobber, no "I'll just do it again to make sure." Engineers are trained to make systems that succeed; we are less practiced at making systems that gracefully decline. The post should examine the small dignity of a job that knows when not to fire.

## Idea: failure-visible-three-ways
status: consumed
claim: For unattended automation, redundant failure signals are not paranoia — they are the contract.
notes: When the daily-blog pipeline fails it does three things: writes a failure report to data/failures/<date>.md, opens a labeled GitHub issue via gh CLI, and sends an email via Resend. Any one of those could fail silently — the runner could be down, gh could rate-limit, the email service could be having a day. Three channels means the operator finds out within a workflow that, by definition, runs without an operator watching. The cost of a missed failure ping is one bad day's content; the cost of building three is one afternoon. The post should land on this asymmetry.

## Idea: cron-on-the-laptop-is-not-automation
status: consumed
claim: A cron job that depends on the operator's machine state is theatre, not infrastructure.
notes: The previous daily-content setup ran via local launchd jobs on a MacBook. It silently skipped every day the laptop was closed, every flight, every long meeting. The operator believed the system was running because the system *could* run — but the run rate was something like 60%. Moving to GitHub Actions removed the dependency on whether anyone happened to be at a keyboard. The pipeline doesn't care if the operator exists. That's the whole point of automation, and the local-cron pattern quietly violated it for months. The post should examine why this confusion is so common — the local cron *feels* like automation because it runs without a click. But "without a click" is not the same as "without a person."

## Idea: the-hand-off-eats-its-own-pipeline
status: consumed
claim: A blog post diagnosing a failure mode is not safe from being shipped through that exact failure mode.
notes: A post titled "The Hand-off: The Psychology of Trust in Agentic Workflows" was published by a multi-agent orchestrator pipeline. The post argues that hand-offs between agents are where trust collapses, that the artifact moves forward but the concern is left behind, and that orchestrators should not write but should set spacing. The pipeline that published it then shipped the post to production with malformed `<<pp>` and `<<imgimg>` tags rendering as literal text — a hand-off failure between the drafting agent and the deploy agent, exactly as the post diagnosed. The single-shot pipeline that replaced it has no hand-off at all. The post should sit with this without becoming smug about it. The previous system was sincere. It just had too many seams.
