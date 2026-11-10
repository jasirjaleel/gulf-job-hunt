// Prepares data for the Job Hunt dashboard on claude.ai and reads its local copy.
// Claude writes to the dashboard with the ArtifactData tool; this script never
// talks to claude.ai. The local copy lives in data/mirror (ArtifactData list with out_dir).
//
//   npm run -s hunt -- prepare <source> <datasetId> [--query ".."] [--actor id] [--run id] [--cost 0.12]
//   npm run -s hunt -- prepare <source> --file items.json
//   npm run -s hunt -- fail <source> --error "reason" [--query ".."]
//   npm run -s hunt -- log-run <source> [datasetId] --actor id --run id --cost 0.08 [--found n] [--added n] [--query ".."]
//   npm run -s hunt -- prepare-companies   (JSON array on stdin)
//   npm run -s hunt -- add-contacts        (JSON array on stdin)
//   npm run -s hunt -- unscored [limit] | job <id> | company <name or id> | profile | budget | digest
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { normalizeKey, safeHttpUrl } from "../lib/text.ts";
import { parseMonthlyAed } from "../lib/salary.ts";
import type { RawItem } from "./sources/common.ts";
import { MAPPERS } from "./sources/index.ts";

const MIRROR = path.join(process.cwd(), "data", "mirror");
const OUTBOX = path.join(process.cwd(), "data", "outbox");
const BATCH_SIZE = 50;
// Switch to the free web fallback a little before the credit runs out, since one run can cost a few cents.
const APIFY_MARGIN_USD = 0.5;
const CONTACT_KINDS = ["hiring_manager", "founder", "recruiter", "agency", "referral", "general"];

type Doc = Record<string, unknown> & { id: string };
type ContactInput = {
  name?: string;
  role?: string;
  kind?: string;
  email?: string;
  linkedin_url?: string;
  whatsapp?: string;
  relationship?: string;
  found_at_url?: string;
};
type CompanyInput = {
  name: string;
  website?: string;
  sector?: string;
  size?: string;
  emirate?: string;
  source?: string;
  fit_notes?: string;
  hiring_signals?: string;
  contacts?: ContactInput[];
};
type Contact = ReturnType<typeof toContact>;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    query: { type: "string", default: "" },
    actor: { type: "string" },
    run: { type: "string" },
    cost: { type: "string" },
    error: { type: "string" },
    found: { type: "string" },
    added: { type: "string" },
  },
});
const [command, ...args] = positionals;

function readCollection(name: string): Doc[] {
  const dir = path.join(MIRROR, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({ id: file.slice(0, -5), ...JSON.parse(readFileSync(path.join(dir, file), "utf8")) }));
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function shortId(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 20);
}

/** Writes each new document to its own file and returns ArtifactData batch entries in groups of 50. */
function outbox(docs: { collection: string; id: string; data: object }[]) {
  const dir = path.join(OUTBOX, new Date().toISOString().replace(/[:.]/g, "-"));
  const writes = docs.map(({ collection, id, data }) => {
    mkdirSync(path.join(dir, collection), { recursive: true });
    const file = path.join(dir, collection, `${id}.json`);
    writeFileSync(file, JSON.stringify(data));
    return { op: "set", collection, doc_id: id, file_path: file };
  });
  const batches = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) batches.push(writes.slice(i, i + BATCH_SIZE));
  return batches;
}

/** Digits only, so the dashboard can build a wa.me link. Anything that isn't a plausible phone number is dropped. */
function phoneDigits(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function toContact(contact: ContactInput, id: string) {
  return {
    id,
    name: contact.name ?? "",
    role: contact.role ?? "",
    kind: CONTACT_KINDS.includes(contact.kind ?? "") ? contact.kind! : "general",
    email: contact.email ?? "",
    linkedinUrl: safeHttpUrl(contact.linkedin_url),
    whatsapp: phoneDigits(contact.whatsapp),
    relationship: contact.relationship ?? "",
    foundAtUrl: safeHttpUrl(contact.found_at_url),
  };
}

function companyId(name: string): string {
  return shortId(normalizeKey(name));
}

function companyData(c: CompanyInput) {
  return {
    name: c.name,
    website: safeHttpUrl(c.website),
    sector: c.sector ?? "",
    size: c.size ?? "",
    emirate: c.emirate ?? "",
    source: c.source ?? "",
    fitNotes: c.fit_notes ?? "",
    hiringSignals: c.hiring_signals ?? "",
    createdAt: new Date().toISOString(),
    contacts: (c.contacts ?? []).map((contact, i) => toContact(contact, `k${i + 1}`)),
  };
}

/** The same person reached the same way, or the same name at the same company. */
function sameContact(a: Contact, b: Contact): boolean {
  const same = (x: string, y: string) => Boolean(x) && x.toLowerCase() === y.toLowerCase();
  return same(a.email, b.email) || same(a.linkedinUrl, b.linkedinUrl) || same(a.whatsapp, b.whatsapp) || same(a.name.trim(), b.name.trim());
}

function nextContactId(contacts: Contact[]): string {
  return `k${Math.max(0, ...contacts.map((c) => Number(String(c.id).slice(1)) || 0)) + 1}`;
}

function apifyBudget() {
  const profile = readCollection("settings").find((doc) => doc.id === "profile");
  const budget = Number(profile?.apify_monthly_budget_usd ?? 5);
  const month = new Date().toISOString().slice(0, 7);
  const spent = readCollection("runs")
    .filter((r) => String(r.createdAt ?? "").startsWith(month))
    .reduce((sum, r) => sum + (Number(r.costUsd) || 0), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    month,
    budget_usd: budget,
    spent_usd: round(spent),
    remaining_usd: round(budget - spent),
    use_fallback: spent >= budget - APIFY_MARGIN_USD,
  };
}

function runDoc(source: string, fields: object) {
  const createdAt = new Date().toISOString();
  return {
    collection: "runs",
    id: shortId(source + createdAt),
    data: {
      source,
      query: values.query ?? "",
      actorId: values.actor ?? null,
      apifyRunId: values.run ?? null,
      datasetId: args[1] ?? null,
      costUsd: values.cost ? Number(values.cost) : null,
      createdAt,
      ...fields,
    },
  };
}

async function loadItems(): Promise<RawItem[]> {
  if (values.file) return JSON.parse(readFileSync(values.file, "utf8"));
  const datasetId = args[1];
  if (!datasetId) throw new Error("Pass a dataset ID or --file.");
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is missing from .env.local.");
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Apify returned ${response.status} for dataset ${datasetId}.`);
  return (await response.json()) as RawItem[];
}

const commands: Record<string, () => void | Promise<void>> = {
  async prepare() {
    const source = args[0];
    const mapper = MAPPERS[source];
    if (!mapper) throw new Error(`Unknown source "${source}". Use: ${Object.keys(MAPPERS).join(", ")}`);
    if (!existsSync(path.join(MIRROR, "jobs"))) {
      console.error("Note: no local copy of jobs yet, so duplicates can't be skipped here. Existing jobs are still protected: the batch is refused rather than overwriting them.");
    }

    const known = new Set(readCollection("jobs").map((job) => job.id));
    const items = await loadItems();
    const createdAt = new Date().toISOString();
    // Each job remembers the search that found it, so the dashboard can show which searches are worth repeating.
    const run = runDoc(source, { status: "succeeded" });
    const fresh = new Map<string, object>();
    let skipped = 0;
    let tooOld = 0;
    // Bayt can't filter by date and returns many month-old listings, so drop anything over a week old.
    const oldBefore = source === "bayt" ? Date.now() - 7 * 86_400_000 : null;

    for (const item of items) {
      const job = mapper(item);
      if (!job.title) {
        skipped += 1;
        continue;
      }
      if (oldBefore && job.postedAt && Date.parse(job.postedAt) < oldBefore) {
        tooOld += 1;
        continue;
      }
      // The same listing on two job sites counts as one job.
      const id = shortId(normalizeKey(job.company, job.title, job.location));
      if (known.has(id) || fresh.has(id)) continue;
      const salary = parseMonthlyAed(job.salaryText);
      fresh.set(id, {
        source,
        sourceId: job.sourceId || null,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        salaryText: job.salaryText,
        salaryMin: salary.min,
        salaryMax: salary.max,
        description: job.description.slice(0, 8000),
        applyUrl: safeHttpUrl(job.applyUrl),
        postedAt: job.postedAt,
        createdAt,
        runId: run.id,
        query: values.query ?? "",
        score: null,
        hidden: false,
      });
    }

    Object.assign(run.data, { found: items.length, added: fresh.size });
    print({
      found: items.length,
      new: fresh.size,
      duplicates: items.length - fresh.size - skipped - tooOld,
      skipped_no_title: skipped,
      ...(oldBefore ? { too_old: tooOld } : {}),
      batches: outbox([
        ...[...fresh].map(([id, data]) => ({ collection: "jobs", id, data })),
        run,
      ]),
    });
  },

  fail() {
    const source = args[0];
    print({ batches: outbox([runDoc(source, { status: "failed", error: values.error ?? "Unknown error", found: 0, added: 0 })]) });
  },

  // Logs a paid run that adds no jobs (e.g. the `contacts` lookup in /find-hiring-contact), so `budget` counts its cost.
  "log-run"() {
    const source = args[0];
    if (!source) throw new Error("Pass a source, e.g. contacts.");
    if (!values.cost) throw new Error("Pass --cost so the budget counts this run.");
    const found = Number(values.found ?? 0) || 0;
    const added = Number(values.added ?? 0) || 0;
    print({ batches: outbox([runDoc(source, { status: "succeeded", found, added })]) });
  },

  // stdin: [{ name, website, sector, size, emirate, source, fit_notes, hiring_signals,
  //           contacts: [{ name, role, kind, email, linkedin_url, whatsapp, relationship, found_at_url }] }]
  "prepare-companies"() {
    const input = JSON.parse(readFileSync(0, "utf8")) as CompanyInput[];
    const known = new Set(readCollection("companies").map((company) => company.id));
    const docs = input
      .map((c) => ({ collection: "companies", id: companyId(c.name), data: companyData(c) }))
      .filter((doc, i, all) => !known.has(doc.id) && all.findIndex((d) => d.id === doc.id) === i);
    print({ new_companies: docs.length, already_saved: input.length - docs.length, batches: outbox(docs) });
  },

  // Adds people to companies, creating a company the first time it's seen.
  // stdin: [{ company: { name, website, sector, ... }, contacts: [{ name, role, kind, ... }] }]
  "add-contacts"() {
    const input = JSON.parse(readFileSync(0, "utf8")) as { company: CompanyInput; contacts: ContactInput[] }[];
    const saved = new Map(readCollection("companies").map((c) => [c.id, c]));
    const created = new Map<string, ReturnType<typeof companyData>>();
    const changed = new Map<string, Contact[]>();
    let duplicates = 0;

    for (const { company, contacts } of input) {
      const id = companyId(company.name);
      const merged = [...(created.get(id)?.contacts ?? changed.get(id) ?? (saved.get(id)?.contacts as Contact[] | undefined) ?? [])];
      for (const contact of contacts) {
        const next = toContact(contact, nextContactId(merged));
        if (merged.some((c) => sameContact(c, next))) duplicates += 1;
        else merged.push(next);
      }
      if (saved.has(id)) changed.set(id, merged);
      else created.set(id, { ...(created.get(id) ?? companyData({ ...company, contacts: [] })), contacts: merged });
    }

    const updates = outbox([...changed].map(([id, contacts]) => ({ collection: "companies", id, data: { contacts } })))
      .flat()
      .map((entry) => ({ ...entry, op: "update" }));
    print({
      new_companies: created.size,
      duplicate_contacts_skipped: duplicates,
      batches: outbox([...created].map(([id, data]) => ({ collection: "companies", id, data }))),
      // Each update needs the company's current version as if_version, from the companies list output.
      updates,
      updated_companies: updates.map((entry) => saved.get(entry.doc_id)?.name),
    });
  },

  unscored() {
    const limit = Number(args[0] ?? 25);
    print(
      readCollection("jobs")
        .filter((job) => job.score == null && !job.hidden)
        .slice(0, limit)
        .map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          remote: job.remote,
          salaryText: job.salaryText,
          description: String(job.description ?? "").slice(0, 1800),
        })),
    );
  },

  job() {
    print(readCollection("jobs").find((job) => job.id === args[0]) ?? null);
  },

  company() {
    const needle = (args[0] ?? "").toLowerCase();
    const company = readCollection("companies").find(
      (c) => c.id === args[0] || String(c.name).toLowerCase().includes(needle),
    );
    if (!company) return print(null);
    const drafts = readCollection("outreach").filter((m) => m.companyId === company.id);
    print({ ...company, existing_drafts: drafts.map((m) => ({ id: m.id, contactId: m.contactId, status: m.status })) });
  },

  profile() {
    print(readCollection("settings").find((doc) => doc.id === "profile") ?? null);
  },

  budget() {
    print(apifyBudget());
  },

  digest() {
    const jobs = readCollection("jobs").filter((job) => !job.hidden);
    const outreach = readCollection("outreach");
    const companies = new Map(readCollection("companies").map((c) => [c.id, c]));
    const profile = readCollection("settings").find((doc) => doc.id === "profile");
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = Date.now() - 7 * 864e5;
    const inAWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const dayAgo = Date.now() - 864e5;
    const app = (job: Doc) => job.app as Record<string, string> | undefined;
    const since = (iso: unknown, t: number) => Boolean(iso) && Date.parse(String(iso)) >= t;
    const typeOf = (m: Doc) => String(m.type ?? "intro");
    const contactsOf = (id: unknown) => (companies.get(String(id))?.contacts as Contact[] | undefined) ?? [];
    const describe = (m: Doc) => ({
      id: m.id,
      type: typeOf(m),
      channel: m.channel,
      company: companies.get(String(m.companyId))?.name ?? "",
      contact: contactsOf(m.companyId).find((c) => c.id === m.contactId)?.name ?? "",
      jobId: m.jobId ?? null,
    });
    const countBy = <T,>(items: T[], key: (item: T) => string) =>
      items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [key(item)]: (counts[key(item)] ?? 0) + 1 }), {});
    const sent = outreach.filter((m) => m.status !== "draft");

    print({
      top_new_matches: jobs
        .filter((job) => job.score != null && !app(job))
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, 10)
        .map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location, score: job.score, found_last_24h: since(job.createdAt, dayAgo) })),
      new_last_24h: jobs.filter((job) => since(job.createdAt, dayAgo)).length,
      unscored: jobs.filter((job) => job.score == null).length,
      ready_to_apply: jobs
        .filter((job) => app(job)?.status === "ready")
        .map((job) => ({ id: job.id, title: job.title, company: job.company, score: job.score, applyUrl: job.applyUrl })),
      applied_last_7_days: jobs.filter((job) => since(app(job)?.appliedAt, weekAgo)).length,
      weekly_goal: [profile?.weekly_goal_min ?? 10, profile?.weekly_goal_max ?? 25],
      applications_by_status: Object.entries(countBy(jobs.filter((job) => app(job)), (job) => app(job)!.status)),
      application_follow_ups_due: jobs
        .filter((job) => app(job)?.followUp && app(job)!.followUp <= today && ["applied", "screening", "interview"].includes(app(job)!.status))
        .map((job) => ({ id: job.id, title: job.title, company: job.company, followUp: app(job)!.followUp, has_draft: Boolean(app(job)!.followUpDraft) })),
      interviews_upcoming: jobs
        .filter((job) => app(job)?.interviewAt && app(job)!.status !== "rejected" && app(job)!.interviewAt.slice(0, 10) >= today)
        .map((job) => ({ id: job.id, title: job.title, company: job.company, interviewAt: app(job)!.interviewAt, details: app(job)!.interviewNote ?? "" })),
      // Apply-by dates in the next 7 days for applications that haven't gone in yet.
      apply_deadlines_soon: jobs
        .filter((job) => job.deadline && ["saved", "preparing", "ready"].includes(app(job)?.status ?? "") && String(job.deadline).slice(0, 10) >= today && String(job.deadline).slice(0, 10) <= inAWeek)
        .map((job) => ({ id: job.id, title: job.title, company: job.company, deadline: job.deadline, status: app(job)!.status })),
      outreach_drafts_waiting: outreach.filter((m) => m.status === "draft").map(describe),
      outreach_follow_ups_due: outreach
        .filter((m) => m.status === "sent" && m.followUpDate && String(m.followUpDate) <= today)
        .map((m) => ({ ...describe(m), followUpDate: m.followUpDate })),
      // Jobs the user is applying to where someone they know works, and no referral ask exists yet.
      referral_asks_to_make: jobs
        .filter((job) => ["ready", "applied"].includes(app(job)?.status ?? ""))
        .flatMap((job) => {
          const id = companyId(String(job.company));
          const asked = outreach.some((m) => m.jobId === job.id && typeOf(m) === "referral");
          return asked
            ? []
            : contactsOf(id).filter((c) => c.kind === "referral").map((c) => ({ jobId: job.id, title: job.title, company: job.company, companyId: id, contactId: c.id, contact: c.name }));
        }),
      messages_sent_last_7_days: countBy(sent.filter((m) => since(m.sentAt, weekAgo)), typeOf),
      replies_by_type: Object.fromEntries(
        Object.entries(countBy(sent, typeOf)).map(([type, total]) => {
          const replied = sent.filter((m) => typeOf(m) === type && m.status === "replied").length;
          return [type, { sent: total, replied, rate: Math.round((replied / total) * 100) + "%" }];
        }),
      ),
      applications_by_source: Object.fromEntries(
        Object.entries(countBy(jobs.filter((job) => app(job)?.appliedAt), (job) => String(job.source))).map(([source, applied]) => [
          source,
          { applied, interview_or_offer: jobs.filter((job) => job.source === source && ["interview", "offer"].includes(app(job)?.status ?? "")).length },
        ]),
      ),
      apify: apifyBudget(),
      readiness: (readCollection("settings").find((doc) => doc.id === "readiness")?.items as unknown[]) ?? [],
    });
  },
};

const run = commands[command];
if (!run) {
  console.error(`Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
