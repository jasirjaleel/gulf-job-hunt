---
name: job-digest
description: Summarise top new job matches, weekly progress and follow-ups due from the Job Hunt dashboard. Use when the user asks what to do today or for a job search update.
---

1. Refresh the local copy of `settings`, `jobs` and `outreach` (see `CLAUDE.md`).
2. Run `npm run -s hunt -- digest` and `npm run -s hunt -- profile`.
3. Report briefly:
   - Applications in the last 7 days against the weekly goal
   - The top matches to act on, with job IDs
   - Application and outreach follow-ups due
   - Any readiness items still open
4. End with the single most useful next step, and link the dashboard. For the full daily report with messages to send and referral asks, use `/morning-brief`.
