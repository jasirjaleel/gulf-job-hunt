---
name: morning-brief
description: Write the daily Job Hunt brief (jobs to apply to, messages to send, referral asks, follow-ups due, weekly progress, Apify credit) and save it to the dashboard's Overview. Use when the user asks for the morning brief or what to do today, and at the end of the daily scheduled run.
---

Dashboard: see `CLAUDE.md` for its URL and how the local copy works.

1. Refresh the local copy of `settings`, `jobs`, `companies`, `outreach` and `runs`, keeping each document's `version`.
2. Run `npm run -s hunt -- digest` and `npm run -s hunt -- profile`.
3. For each item in `application_follow_ups_due` with `has_draft: false`, write a two-sentence follow-up: the role, that the user is still interested, and one new thing (a recent project or a relevant skill from the profile). Save it with ArtifactData `update` on `jobs/<id>`, `{"app": {"followUpDraft": "..."}}`, with `if_version`. Never send it.
4. Write the brief in Markdown, short and scannable, using these sections and leaving out any that are empty:
   - `## Apply today`: `ready_to_apply`, then top matches scoring 70 or more found in the last 24 hours that have no documents yet. Give the title, company, score, job ID and apply link. Add: "Check each link still works. On LinkedIn, skip roles with 100+ applicants."
   - `## Interviews and deadlines`: `interviews_upcoming` (date, time, company and the details the user saved) and `apply_deadlines_soon`. Put anything due today or tomorrow first.
   - `## Send today`: `outreach_drafts_waiting`, at most 15, ordered job, referral, recruiter, intro, pitch. One line each: type, company, contact, channel.
   - `## Referral asks`: `referral_asks_to_make`, with the person and the job.
   - `## Follow-ups due`: outreach and application follow-ups.
   - `## This week`: applications against the weekly goal, messages sent by type, and replies by type.
   - `## Apify`: spent against budget. Say so if the run used the free web fallback.
   - On Fridays only, `## Weekly review`: use `replies_by_type` and `applications_by_source` to suggest two or three specific changes, such as more of the message type getting replies. If a type has fewer than 10 messages sent, say it's too early to judge it.
   - End with one line: the single most useful next step.
5. Save it with ArtifactData `set` on `settings/brief`: `{"date": "<YYYY-MM-DD>", "markdown": "...", "createdAt": "<ISO time>"}`, passing `if_version` if the document exists. The dashboard shows it at the top of the Overview.
6. Reply with the brief and the dashboard link. Never send, apply or log in to anything.
