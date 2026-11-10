# Job Hunt Platform

Claude Code commands for a UAE and remote job search. Claude scrapes jobs through the Apify MCP server, scores them, and drafts resumes, cover letters and outreach. Everything appears on your own private dashboard on claude.ai.

You review everything and send it yourself.

## Setup
1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add your Apify API token.
3. Run `claude` in this folder, approve the `apify` MCP server, and sign in with `/mcp`.

## Use it
Run these in Claude Code:
- `/find-jobs web developer Dubai`
- `/browse-jobs full stack developer Dubai` (Indeed, NaukriGulf and LinkedIn in your Chrome)
- `/score-jobs`
- `/prepare-application <job id>`
- `/find-companies software Dubai`
- `/find-recruiters software`
- `/find-hiring-contact <job id>`
- `/add-network`
- `/draft-outreach <company> [job id] [type]`
- `/morning-brief`
- `/job-digest`

See `CLAUDE.md` for how the data is stored and the rules Claude follows.
