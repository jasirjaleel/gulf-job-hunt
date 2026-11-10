// Builds a one-file Word CV from Markdown in the navy CV design, with no dependencies.
//
// Markdown it understands:
//   # Name
//   Subtitle line
//   Contact line, parts separated by " | ", links as [LinkedIn](https://...)
//   ## Section
//   ### Role — Organisation | Dates      (role in bold, dates right-aligned)
//   - Bullet                              (a Word bullet; a plain line in list-style sections)
//   **Bold**, [text](url), and "Label: text" lines in skills-style sections.
import { crc32, deflateRawSync } from "node:zlib";

const NAVY = "1F3864";
const TEXT = "222222";
const GREY = "595959";
const RIGHT_TAB = 10290;
// Sections the CV lays out as plain lines rather than bullets.
const PLAIN_SECTIONS = /PROJECT|SKILL|COMPETENC|LANGUAGE|LEADERSHIP|EDUCATION|CERTIF/;

type Run = { text: string; bold?: boolean; italic?: boolean; color?: string; size?: number; link?: string; tab?: boolean };

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class Doc {
  links: string[] = [];
  paragraphs: string[] = [];

  run(r: Run): string {
    const props = [
      `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>`,
      r.bold ? "<w:b/><w:bCs/>" : "",
      r.italic ? "<w:i/><w:iCs/>" : "",
      `<w:color w:val="${r.color ?? TEXT}"/>`,
      `<w:sz w:val="${r.size ?? 20}"/><w:szCs w:val="${r.size ?? 20}"/>`,
      r.link ? `<w:u w:val="single"/>` : "",
    ].join("");
    const body = r.tab ? "<w:tab/>" : `<w:t xml:space="preserve">${escapeXml(r.text)}</w:t>`;
    const xml = `<w:r><w:rPr>${props}</w:rPr>${body}</w:r>`;
    if (!r.link) return xml;
    this.links.push(r.link);
    return `<w:hyperlink r:id="rIdLink${this.links.length}" w:history="1">${xml}</w:hyperlink>`;
  }

  add(pPr: string, runs: Run[]) {
    this.paragraphs.push(`<w:p><w:pPr>${pPr}</w:pPr>${runs.map((r) => this.run(r)).join("")}</w:p>`);
  }
}

/** Splits **bold**, [text](url) and bare links into runs. Bare links are shown by their text, never as a printed URL. */
function inline(text: string, base: Omit<Run, "text"> = {}): Run[] {
  const runs: Run[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) runs.push({ ...base, text: text.slice(last, m.index) });
    if (m[1]) runs.push({ ...base, text: m[1], bold: true });
    else if (m[2]) runs.push({ ...base, text: m[2], link: m[3] });
    else runs.push({ ...base, text: m[4].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), link: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ ...base, text: text.slice(last) });
  return runs;
}

/** Turns emails in the contact line into mailto links. */
function contactRuns(line: string): Run[] {
  const base = { color: GREY, size: 19 };
  return line
    .split(/\s+\|\s+/)
    .flatMap((part, i) => [
      ...(i ? [{ ...base, text: "  |  " }] : []),
      ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part) ? [{ ...base, text: part, link: `mailto:${part}` }] : inline(part, base)),
    ]);
}

/** "Role — Organisation | Dates" as a bold role, the organisation, and right-aligned italic dates. */
function datedLine(doc: Doc, left: string, dates: string) {
  const [role, ...rest] = left.split(/\s+[—–-]\s+/);
  doc.add(`<w:tabs><w:tab w:val="right" w:pos="${RIGHT_TAB}"/></w:tabs><w:spacing w:before="60" w:after="0"/>`, [
    ...inline(role, { bold: true }),
    ...(rest.length ? [{ text: "  —  " + rest.join(" — ") }] : []),
    { text: "", tab: true },
    { text: dates, italic: true, color: GREY },
  ]);
}

function splitDates(text: string): [string, string] | null {
  const at = text.lastIndexOf(" | ");
  if (at < 0) return null;
  const dates = text.slice(at + 3).trim();
  return /\b(19|20)\d{2}\b|present/i.test(dates) ? [text.slice(0, at).trim(), dates.replace(/\s+-\s+/g, " – ")] : null;
}

export function markdownToDocxXml(markdown: string) {
  const doc = new Doc();
  const lines = markdown.replace(/\r/g, "").split("\n").map((l) => l.trimEnd());
  let named = false;
  let subtitled = false;
  let section = "";
  for (const raw of lines) {
    const line = raw.trim().replace(/^[•●▪◦]\s*/, "- ");
    if (!line) continue;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (heading?.[1] === "#") {
      doc.add(`<w:spacing w:after="30"/><w:jc w:val="center"/>`, [{ text: heading[2], bold: true, color: NAVY, size: 42 }]);
      named = true;
    } else if (named && !section && !heading && !bullet) {
      // Lines between the name and the first section: a subtitle, then contact details.
      if (!subtitled && !/\|/.test(line)) doc.add(`<w:spacing w:after="50"/><w:jc w:val="center"/>`, [{ text: line, color: GREY, size: 23 }]);
      else doc.add(`<w:spacing w:after="0"/><w:jc w:val="center"/>`, contactRuns(line));
      subtitled = true;
    } else if (heading?.[1] === "##") {
      section = heading[2].toUpperCase();
      doc.add(
        `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${NAVY}"/></w:pBdr><w:spacing w:before="140" w:after="50"/>`,
        [{ text: section, bold: true, color: NAVY, size: 21 }],
      );
    } else if (heading) {
      const dated = splitDates(heading[2]);
      if (dated) datedLine(doc, ...dated);
      else doc.add(`<w:spacing w:before="60" w:after="0"/>`, inline(heading[2], { bold: true }));
    } else {
      const text = bullet ? bullet[1] : line;
      const plain = PLAIN_SECTIONS.test(section) || !bullet;
      const dated = plain ? splitDates(text) : null;
      if (dated && /EDUCATION|CERTIF/.test(section)) datedLine(doc, ...dated);
      else if (plain) {
        // "Label: text" in skills-style sections gets a bold label.
        const label = /SKILL|LANGUAGE|LEADERSHIP/.test(section) && !text.startsWith("**") ? text.match(/^([^:]{2,30}):\s+(.*)$/) : null;
        doc.add(`<w:spacing w:after="25"/>`, label ? [{ text: label[1] + ":  ", bold: true }, ...inline(label[2])] : inline(text));
      } else doc.add(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="25"/>`, inline(text));
    }
  }
  return doc;
}

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

export function buildDocx(markdown: string, title: string, author: string): Buffer {
  const doc = markdownToDocxXml(markdown);
  const rels = doc.links
    .map(
      (url, i) =>
        `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`,
    )
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(author)}</dc:creator></cp:coreProperties>`,
    "word/_rels/document.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels}</Relationships>`,
    "word/styles.xml": `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="222" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
    "word/numbering.xml": `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="560" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    "word/document.xml": `${XML}<w:document ${NS}><w:body>${doc.paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="560" w:right="808" w:bottom="480" w:left="808" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  };
  return zip(Object.entries(files).map(([name, text]) => [name, Buffer.from(text, "utf8")]));
}

/** A minimal ZIP writer (deflate), enough for a .docx. */
function zip(entries: [string, Buffer][]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time and date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, packed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
