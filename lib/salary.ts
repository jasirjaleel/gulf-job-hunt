export interface AedSalary {
  min: number | null;
  max: number | null;
}

/**
 * Reads a monthly AED range from free text. Returns nulls for anything it
 * can't be sure of, such as other currencies or yearly pay, so those jobs are
 * never filtered out on a wrong number.
 */
export function parseMonthlyAed(text: string): AedSalary {
  if (!/\b(aed|dhs?|dirhams?)\b/i.test(text)) return { min: null, max: null };
  if (/\b(year|yearly|annual|annum|p\.?a\.?)\b/i.test(text)) return { min: null, max: null };

  const values = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi)]
    .map((match) => {
      const amount = Number(match[1].replace(/,/g, ""));
      return match[2] ? amount * 1000 : amount;
    })
    .filter((amount) => amount >= 500 && amount <= 200000);

  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}
