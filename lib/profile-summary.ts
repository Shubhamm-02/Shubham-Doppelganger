import { readFileSync } from "node:fs";
import path from "node:path";

export type ProfileHighlight = { label: string; detail: string };

export type ProfileSummary = {
  name: string;
  positioning: string;
  highlights: ProfileHighlight[];
  links: { github: string; linkedin: string; email: string };
};

type Project = { title: string; bullets: string[] };

const RESUME_PATH = path.join(process.cwd(), "data", "resume.md");

let cached: ProfileSummary | null = null;

export function getProfileSummary() {
  cached ??= parseProfileSummary(readFileSync(RESUME_PATH, "utf8"));
  return cached;
}

export function parseProfileSummary(markdown: string): ProfileSummary {
  const sections = splitSections(markdown);
  const header = sections.get("") ?? "";
  const projects = parseProjects(sections.get("Projects") ?? "");

  return {
    name: required(header.match(/^#\s+(.+)$/m), "name")[1].trim(),
    positioning: positioningFrom(required(header.match(/^\*\*(.+\|.+)\*\*\s*$/m), "headline")[1]),
    highlights: [
      commentAiHighlight(projects),
      ccpaHighlight(projects),
      pdfChatbotHighlight(projects),
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

function parseProjects(section: string): Project[] {
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

function findProject(projects: Project[], prefix: string) {
  return required(
    projects.find((project) => project.title.startsWith(prefix)),
    `project "${prefix}"`
  );
}

function findInBullets(project: Project, pattern: RegExp) {
  for (const bullet of project.bullets) {
    const match = bullet.match(pattern);
    if (match) return match;
  }
  throw new Error(`resume.md: no bullet in "${project.title}" matches ${pattern}`);
}

function commentAiHighlight(projects: Project[]): ProfileHighlight {
  const project = findProject(projects, "CommentAI");
  const [name, kind] = project.title.split(/\s+—\s+|\s+\(/);
  const [, outputs, amount] = findInBullets(project, /guardrails.*reducing (.+?) by \*\*(.+?)\*\*/);
  return { label: name, detail: `${sentenceCase(kind)}; guardrails cut ${outputs} by ${amount}` };
}

function ccpaHighlight(projects: Project[]): ProfileHighlight {
  const project = findProject(projects, "CCPA");
  const [, chunks, precision] = findInBullets(project, /Indexed \*\*(.+?)\*\*.*retrieval precision by \*\*(.+?)\*\*/);
  return { label: sentenceCase(titleName(project)), detail: `Indexed ${chunks}; retrieval precision up ${precision}` };
}

function pdfChatbotHighlight(projects: Project[]): ProfileHighlight {
  const project = findProject(projects, "PDF Grounded Chatbot");
  const [, scope, citations] = findInBullets(project, /answers questions (strictly from uploaded PDFs) with (.+?)\.?$/);
  return { label: sentenceCase(titleName(project)), detail: `Answers ${scope}, with ${citations}` };
}

function educationHighlight(section: string): ProfileHighlight {
  const school = required(section.match(/^\*\*(.+?)\*\*\s*$/m), "school")[1];
  const [, score, scale] = required(section.match(/\*\*CGPA:\s*([\d.]+)\s*\/\s*([\d.]+)\*\*/), "CGPA");
  return { label: `CGPA ${Number(score)} / ${Number(scale)}`, detail: school };
}

function positioningFrom(headline: string) {
  const [role, focus] = headline.split("|").map((part) => sentenceCase(part.trim()));
  return `${role} building ${focus.replace(" & ", " and ")}`;
}

function titleName(project: Project) {
  return project.title.split(/\s+\(|\s+—\s+/)[0];
}

function sentenceCase(text: string) {
  return text
    .split(" ")
    .map((word, index) => (index > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(" ");
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`resume.md: could not find ${what}`);
  return value;
}
