import { mapCommon, pick, stripHtml, type MappedJob, type RawItem } from "./common.ts";

type Mapper = (item: RawItem) => MappedJob;

// valig/linkedin-jobs-scraper: postedDate is an ISO date; applyUrl is often empty, so mapCommon falls back to url.
const mapLinkedin: Mapper = (item) => {
  const job = mapCommon(item);
  return { ...job, postedAt: pick(item, "postedDate") || job.postedAt };
};

// valig/indeed-jobs-scraper: company, location, description and salary are nested objects.
const mapIndeed: Mapper = (item) => {
  const job = mapCommon(item);
  const salary = (item.baseSalary ?? {}) as { min?: number | null; max?: number | null; unitOfWork?: string | null; currencyCode?: string | null };
  const range = [salary.min, salary.max].filter((n) => typeof n === "number").join(" - ");
  const salaryText = range ? `${salary.currencyCode ?? ""} ${range}${salary.unitOfWork ? ` per ${salary.unitOfWork.toLowerCase()}` : ""}`.trim() : "";
  const location = [pick(item, "location.city"), pick(item, "location.countryName")].filter(Boolean).join(", ");
  return {
    ...job,
    sourceId: pick(item, "key") || job.sourceId,
    company: pick(item, "employer.name", "parentEmployer.name") || job.company,
    location: location || job.location,
    remote: /\bremote\b/i.test(location) || job.remote,
    description: stripHtml(pick(item, "description.text", "description.html")) || job.description,
    salaryText,
    postedAt: pick(item, "datePublished", "dateOnIndeed") || job.postedAt,
  };
};

// shahidirfan/Bayt-Jobs-Scraper: only a relative date ("17 days ago", "30+ days ago").
const mapBayt: Mapper = (item) => {
  const job = mapCommon(item);
  const relative = pick(item, "postedAtRelative");
  const days = /today|hour|minute/i.test(relative) ? 0 : Number(relative.match(/(\d+)\+?\s*day/i)?.[1] ?? NaN);
  const scraped = Date.parse(pick(item, "scrapedAt")) || Date.now();
  const postedAt = Number.isFinite(days) ? new Date(scraped - days * 86_400_000).toISOString() : null;
  return { ...job, postedAt: job.postedAt ?? postedAt };
};

// One entry per source. Each scraper's own field names go here when they
// aren't already covered by mapCommon.
export const MAPPERS: Record<string, Mapper> = {
  linkedin: mapLinkedin,
  indeed: mapIndeed,
  bayt: mapBayt,
  gulftalent: mapCommon,
  naukrigulf: mapCommon,
  remote: mapCommon,
  // Listings Claude collects itself (web search, career pages, Claude in Chrome) when Apify is out of credit.
  web: mapCommon,
  // LinkedIn hiring posts the user found and pasted into /add-post.
  post: mapCommon,
};
