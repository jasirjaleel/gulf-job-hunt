---
name: add-network
description: Add people the user knows personally (friends, ex-colleagues, bootcamp alumni, community contacts) to the Job Hunt dashboard as referral contacts, and match them to open jobs. Use when the user lists people they know, or asks about referrals.
argument-hint: "[people, one per line]"
---

People: $ARGUMENTS

Dashboard: see `CLAUDE.md` for its URL and how the local copy works.

1. If no one was given, ask the user to paste a list, one person per line: name, where they work now, their role if known, how the user knows them, and a WhatsApp number or LinkedIn URL. People with no current workplace can still be added.
2. These are the user's own contacts, so their personal numbers and emails are allowed (see `CLAUDE.md`). Use only what the user gave. Don't look these people up online and don't add details about them.
3. Refresh the local copy of `companies` and `jobs`, keeping the `version` of each company. Then run:
   ```bash
   npm run -s hunt -- add-contacts <<'JSON'
   [{"company": {"name": "Where they work", "source": "network"},
     "contacts": [{"name": "...", "role": "...", "kind": "referral", "relationship": "How the user knows them",
                   "whatsapp": "+971...", "linkedin_url": "https://...", "email": ""}]}]
   JSON
   ```
   Use the company name as it appears on job listings, so jobs match it. For someone with no workplace, use the company `Personal network` with `"sector": "network"`.
4. Send each printed batch with ArtifactData `action: "batch"`. Send the `updates` the same way, adding each company's `if_version` from the list output. If a write is refused as stale, refresh `companies` and run `add-contacts` again.
5. Report who was added and who was skipped as a duplicate. For each person, list any jobs on the dashboard at their company. Offer to draft referral asks with `/draft-outreach <company> <job id>`. Remind the user to ask only people they're comfortable asking.
