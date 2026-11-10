export type RawItem = Record<string, unknown>;

export interface MappedJob {
  sourceId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salaryText: string;
  description: string;
  applyUrl: string;
  postedAt: string | null;
}

function lookup(item: RawItem, dottedPath: string): unknown {
  return dottedPath
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as RawItem)[key]
          : undefined,
      item,
    );
}

/** First non-empty value among the field names a scraper might use. */
export function pick(item: RawItem, ...paths: string[]): string {
  for (const dottedPath of paths) {
    const value = lookup(item, dottedPath);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

export function stripHtml(text: string): string {
  return text
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mapCommon(item: RawItem): MappedJob {
  const location = pick(item, "location", "jobLocation", "city", "formattedLocation", "location.city");
  const description = stripHtml(
    pick(item, "descriptionText", "description", "jobDescription", "descriptionHtml", "job_description"),
  );
  const remoteField = lookup(item, "remote") ?? lookup(item, "isRemote");
  return {
    sourceId: pick(item, "id", "jobId", "jobKey", "positionId", "externalId"),
    title: pick(item, "title", "jobTitle", "positionName", "position"),
    company: pick(item, "companyName", "company", "company.name", "employer"),
    location,
    remote: remoteField === true || /\bremote\b/i.test(location),
    salaryText: pick(item, "salary", "salaryText", "salaryInfo", "salary.text", "baseSalary"),
    description,
    applyUrl: pick(item, "applyUrl", "externalApplyLink", "applyLink", "jobUrl", "link", "url"),
    postedAt: pick(item, "postedAt", "datePosted", "postingDate", "publishedAt") || null,
  };
}
