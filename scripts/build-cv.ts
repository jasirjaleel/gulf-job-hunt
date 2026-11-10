// Turns a tailored Markdown resume into a Word CV in the user's navy design.
//
//   npm run -s cv -- <resume.md> "<Company>" "<Role>"
//
// Saves to ~/Downloads/CVs-Resumes/Applications/<YYYY-MM-DD> - <Name> CV - <Company> - <Role>.docx
// (date first, as the user names all CVs) and prints the path.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { buildDocx } from "../lib/docx.ts";

const [file, company, role] = process.argv.slice(2);
if (!file || !company || !role) {
  console.error('Usage: npm run -s cv -- <resume.md> "<Company>" "<Role>"');
  process.exit(1);
}
const markdown = readFileSync(file, "utf8");
const name = markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? "CV";
const clean = (text: string) => text.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
const dir = path.join(homedir(), "Downloads", "CVs-Resumes", "Applications");
const out = path.join(dir, `${new Date().toISOString().slice(0, 10)} - ${clean(name)} CV - ${clean(company)} - ${clean(role)}.docx`);
mkdirSync(dir, { recursive: true });
writeFileSync(out, buildDocx(markdown, `${name} CV - ${company}`, name));
console.log(JSON.stringify({ cvFile: out }));
