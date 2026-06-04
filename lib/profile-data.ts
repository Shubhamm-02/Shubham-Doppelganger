import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type ProfileSource = {
  id: string;
  title: string;
  kind: "resume" | "project-note";
  relativePath: string;
  content: string;
};

export type ProfileMatch = ProfileSource & {
  score: number;
  excerpt: string;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
  "your"
]);

function dataPath(...segments: string[]) {
  return path.join(process.cwd(), "data", ...segments);
}

function titleFromMarkdown(content: string, fallback: string) {
  const firstHeading = content
    .split("\n")
    .find((line) => line.trim().startsWith("# "));

  return firstHeading?.replace(/^#\s+/, "").trim() || fallback;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function makeExcerpt(content: string, tokens: string[]) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const bestParagraph =
    paragraphs.find((paragraph) => {
      const lower = paragraph.toLowerCase();
      return tokens.some((token) => lower.includes(token));
    }) ?? paragraphs[0];

  return bestParagraph.length > 700
    ? `${bestParagraph.slice(0, 700).trim()}...`
    : bestParagraph;
}

export function loadProfileSources(): ProfileSource[] {
  const sources: ProfileSource[] = [];
  const resumeFile = dataPath("resume.md");

  if (existsSync(resumeFile)) {
    const content = readFileSync(resumeFile, "utf8");
    sources.push({
      id: "resume",
      title: titleFromMarkdown(content, "Resume"),
      kind: "resume",
      relativePath: "data/resume.md",
      content
    });
  }

  const projectNotesDir = dataPath("project-notes");
  if (existsSync(projectNotesDir)) {
    for (const fileName of readdirSync(projectNotesDir).sort()) {
      if (!fileName.endsWith(".md")) continue;

      const relativePath = `data/project-notes/${fileName}`;
      const content = readFileSync(dataPath("project-notes", fileName), "utf8");
      sources.push({
        id: fileName.replace(/\.md$/, ""),
        title: titleFromMarkdown(content, fileName),
        kind: "project-note",
        relativePath,
        content
      });
    }
  }

  return sources;
}

export function searchProfileSources(query: string, limit = 4): ProfileMatch[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  return loadProfileSources()
    .map((source) => {
      const sourceTokens = tokenize(source.content);
      const sourceTokenSet = new Set(sourceTokens);
      const overlap = queryTokens.filter((token) => sourceTokenSet.has(token));
      const titleBoost = queryTokens.some((token) =>
        source.title.toLowerCase().includes(token)
      )
        ? 3
        : 0;

      return {
        ...source,
        score: overlap.length + titleBoost,
        excerpt: makeExcerpt(source.content, queryTokens)
      };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
