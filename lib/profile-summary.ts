import { readFileSync } from "node:fs";
import path from "node:path";

export type ProfileHighlight = { label: string; detail: string };

export type ProfileSummary = {
  name: string;
  positioning: string;
  highlights: ProfileHighlight[];
  links: { github: string; linkedin: string; email: string };
};

type Entry = { title: string; bullets: string[] };

const RESUME_PATH = path.join(process.cwd(), "data", "resume.md");

let cached: ProfileSummary | null = null;

export function getProfileSummary() {
  cached ??= parseProfileSummary(readFileSync(RESUME_PATH, "utf8"));
  return cached;
}

export function parseProfileSummary(markdown: string): ProfileSummary {
  const sections = splitSections(markdown);
  const header = sections.get("") ?? "";
  const achievements = parseEntries(sections.get("Achievements") ?? "");
  const projects = parseEntries(sections.get("Projects") ?? "");

  return {
    name: required(header.match(/^#\s+(.+)$/m), "name")[1].trim(),
    positioning: positioningFrom(required(header.match(/^\*\*(.+\|.+)\*\*\s*$/m), "headline")[1]),
    highlights: [
      hackathonRankHighlight(achievements),
      hackathonWinHighlight(achievements),
      workflowBuilderHighlight(projects),
      educationHighlight(sections.get("Education") ?? "")
    ],
    links: {
      github: required(header.match(/\((https:\/\/github\.com\/[^)\s]+)\)/), "GitHub link")[1],
      linkedin: required(header.match(/\((https:\/\/(?:www\.)?linkedin\.com\/[^)\s]+)\)/), "LinkedIn link")[1],
      email: required(header.match(/\(mailto:([^)\s]+)\)/), "email")[1]
    }
  };
}

function splitSections(markdown: string) {
  const sections = new Map<string, string>();
  const parts = markdown.split(/^## /m);
  sections.set("", parts[0]);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    sections.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return sections;
}

function parseEntries(section: string): Entry[] {
  return section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [title, ...lines] = block.split("\n");
      return {
        title: title.trim(),
        bullets: lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim())
      };
    });
}

function findEntry(entries: Entry[], prefix: string) {
  return required(
    entries.find((entry) => entry.title.startsWith(prefix)),
    `entry "${prefix}"`
  );
}

function findInBullets(entry: Entry, pattern: RegExp) {
  for (const bullet of entry.bullets) {
    const match = bullet.match(pattern);
    if (match) return match;
  }
  throw new Error(`resume.md: no bullet in "${entry.title}" matches ${pattern}`);
}

function hackathonRankHighlight(achievements: Entry[]): ProfileHighlight {
  const entry = findEntry(achievements, "HACKHAZARDS");
  const [, placing, project, submissions] = findInBullets(
    entry,
    /^Placed (.+?) with \*\*(.+?)\*\*.*? among \*\*(.+?)\*\* final project submissions/
  );
  return {
    label: entry.title.split(":")[0],
    detail: `Placed ${placing} with ${project}, among ${submissions} submissions`
  };
}

function hackathonWinHighlight(achievements: Entry[]): ProfileHighlight {
  const entry = findEntry(achievements, "1st Place");
  const [, event, track] = required(
    entry.title.match(/^1st Place, .*? with (.+?) \((.+?)\)$/),
    "hackathon win"
  );
  const [, system] = findInBullets(entry, /^Built an? (.+?) for /);
  return { label: event, detail: `1st place in the ${track} with an ${system}` };
}

function workflowBuilderHighlight(projects: Entry[]): ProfileHighlight {
  const entry = findEntry(projects, "Galaxy AI Workflow Builder");
  const [, validation, runs] = findInBullets(
    entry,
    /^Implemented typed \*\*(.+?)\*\*, (full\/single\/partial workflow runs)/
  );
  return {
    label: entry.title.replace(/ Clone$/, ""),
    detail: `Typed ${validation}, ${runs}, and background execution`
  };
}

function educationHighlight(section: string): ProfileHighlight {
  const schools = Array.from(section.matchAll(/^\*\*(.+?)\*\*\s*$/gm), (match) => match[1]);
  const degrees = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:B|M)\.Sc\./.test(line));
  if (schools.length < 2 || degrees.length < 2) throw new Error("resume.md: could not find both programmes");
  return { label: schools.join(" + "), detail: degrees.join(" + ") };
}

// "Software Engineer | AI/ML Engineer | LLM Systems" → "Software engineer focused on AI/ML and LLM systems"
function positioningFrom(headline: string) {
  const [role, ...focuses] = headline.split("|").map((part) => lowerCommonWords(part.trim()));
  const areas = focuses.map((focus) => focus.replace(/\s+engineer$/, ""));
  const list =
    areas.length > 2 ? `${areas.slice(0, -1).join(", ")}, and ${areas.at(-1)}` : areas.join(" and ");
  return `${role.charAt(0).toUpperCase()}${role.slice(1)} focused on ${list}`;
}

// Lowercases ordinary capitalised words and keeps acronyms such as AI/ML or LLM.
function lowerCommonWords(text: string) {
  return text.replace(/\b[A-Z][a-z]+(?:-[A-Z][a-z]+)*\b/g, (word) => word.toLowerCase());
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`resume.md: could not find ${what}`);
  return value;
}
