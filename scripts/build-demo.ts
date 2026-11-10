// Builds demo/index.html: the dashboard joined with made-up demo data, so it opens in any browser
// without a claude.ai account. Nothing in the demo is saved.
//
//   npm run demo
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const data = readFileSync(path.join(root, "demo", "demo-data.html"), "utf8");
const page = readFileSync(path.join(root, "dashboard", "job-hunt.html"), "utf8");
const out = path.join(root, "demo", "index.html");
writeFileSync(out, data + page);
console.log(out);
