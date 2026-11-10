// Builds docs/demo/index.html: the dashboard joined with made-up demo data, so it opens in any browser
// without a claude.ai account. Nothing in the demo is saved. The website in docs/ links to it.
//
//   npm run demo
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const data = readFileSync(path.join(root, "demo", "demo-data.html"), "utf8");
const page = readFileSync(path.join(root, "dashboard", "job-hunt.html"), "utf8");
const out = path.join(root, "docs", "demo", "index.html");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, data + page);
console.log(out);
