import { chunkBody, plainText } from "@/lib/profile/sources";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const MAX_PROJECTS = 5;
const MAX_RECENT = 5;
const RECENT_MENTIONS = 3;
const MIN_SUMMARY_LENGTH = 30;
const MAX_SUMMARY_LENGTH = 220;
const METADATA_LINE =
  /^- (?:Project name|GitHub|Deployed app|Source|Created|Last pushed|Languages|Topics|Description):/;
const NON_PROSE_LINE = /^(?:#|\||>|<|!\[|\[!\[)/;

export type RecentRepo = {
  title: string;
  lastActive: string;
  summary: string;
  chunk: RetrievedChunk;
};

function isProjectChunk(chunk: RetrievedChunk) {
  return (
    chunk.kind === "github" ||
    (chunk.kind === "project-note" && chunk.path.startsWith("data/project-notes/"))
  );
}

function isProse(line: string) {
  return /[a-z]{3}/i.test(line) && !NON_PROSE_LINE.test(line) && !METADATA_LINE.test(line);
}

function bodyLines(chunk: RetrievedChunk) {
  let inCodeBlock = false;
  return chunkBody(chunk.content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (/^(?:```|~~~)/.test(line)) {
        inCodeBlock = !inCodeBlock;
        return false;
      }
      return !inCodeBlock;
    });
}

function headerValue(chunk: RetrievedChunk, label: string) {
  const line = bodyLines(chunk).find((candidate) => candidate.startsWith(`- ${label}:`));
  const value = line?.slice(`- ${label}:`.length).trim();
  return value && !/^none$/i.test(value) ? value : null;
}

function clip(text: string) {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  const cut = text.slice(0, MAX_SUMMARY_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

function projectSummary(chunk: RetrievedChunk) {
  const lines = bodyLines(chunk);

  const description = headerValue(chunk, "Description");
  if (description && /[a-z]/i.test(description)) return plainText(description);

  const oneLineIndex = lines.findIndex((line) => /^## One-Line Summary/i.test(line));
  if (oneLineIndex >= 0) {
    const next = lines.slice(oneLineIndex + 1).find(isProse);
    if (next) return plainText(next);
  }

  const firstLine = lines.find(isProse);
  return firstLine ? plainText(firstLine.replace(/^-\s*/, "")) : "";
}

function chunkRank(chunk: RetrievedChunk) {
  if (chunk.kind === "github") return projectSummary(chunk) ? -chunk.chunkIndex : -Infinity;

  let rank = 0;
  if (/one-line summary/i.test(chunk.content)) rank += 8;
  if (/^(one-line summary|why this project matters|purpose|what it does|features)$/i.test(chunk.section)) {
    rank += 4;
  }
  if (/^(source|setup|run|test|questions this note can answer|extra details to add later)$/i.test(chunk.section)) {
    rank -= 3;
  }
  return rank;
}

function monthYear(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

// Newest first by last push, so "recent" means recently worked on, not merely created.
export function recentRepos(chunks: RetrievedChunk[]): RecentRepo[] {
  const byRepo = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    if (chunk.kind !== "github") continue;
    byRepo.set(chunk.path, [...(byRepo.get(chunk.path) ?? []), chunk]);
  }

  return Array.from(byRepo.values())
    .flatMap((repoChunks) => {
      const ordered = [...repoChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const header = ordered[0];
      const lastActive = headerValue(header, "Last pushed") ?? headerValue(header, "Created");
      const description = headerValue(header, "Description");
      // Without a repo description, fall back to the README's first substantial line.
      const described = description
        ? { chunk: header, summary: plainText(description) }
        : ordered
            .map((chunk) => ({ chunk, summary: projectSummary(chunk) }))
            .find(({ summary }) => summary.length >= MIN_SUMMARY_LENGTH);
      if (!lastActive || !described) return [];
      return [
        { title: header.title, lastActive, summary: clip(described.summary), chunk: described.chunk }
      ];
    })
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive));
}

export function recentWorkDigest(repos: RecentRepo[]) {
  const listed = repos.slice(0, MAX_RECENT);
  if (!listed.length) return null;

  const bullets = listed
    .map((repo) => `- ${repo.title} (${monthYear(repo.lastActive)}): ${repo.summary}`)
    .join("\n");

  return {
    answer: [
      "Shubham's most recent projects, newest first:",
      "",
      bullets,
      "",
      "Ask about any of them for the details."
    ].join("\n"),
    chunks: listed.map((repo) => repo.chunk)
  };
}

export function projectDigest(chunks: RetrievedChunk[], recent: RecentRepo[] = []) {
  const byProject = new Map<string, RetrievedChunk>();

  for (const chunk of chunks) {
    if (!isProjectChunk(chunk)) continue;
    const existing = byProject.get(chunk.path);
    if (!existing || chunkRank(chunk) > chunkRank(existing)) {
      byProject.set(chunk.path, chunk);
    }
  }

  const projects = Array.from(byProject.values());
  const listed = [
    ...projects.filter((chunk) => chunk.kind !== "github"),
    ...projects.filter((chunk) => chunk.kind === "github")
  ].slice(0, MAX_PROJECTS);
  if (!listed.length) return null;

  const bullets = listed
    .map((chunk) => {
      const summary = projectSummary(chunk);
      return `- ${chunk.title}${summary ? `: ${summary}` : ""}`;
    })
    .join("\n");

  const listedPaths = new Set(listed.map((chunk) => chunk.path));
  const newer = recent
    .filter((repo) => !listedPaths.has(repo.chunk.path))
    .slice(0, RECENT_MENTIONS)
    .map((repo) => repo.title);

  return {
    answer: [
      "Shubham's strongest project examples include:",
      "",
      bullets,
      "",
      "These are relevant because they show practical work with RAG, agents, local LLMs, retrieval, guardrails, and deployed AI tools.",
      ...(newer.length ? ["", `His most recent work on GitHub: ${newer.join(", ")}.`] : [])
    ].join("\n"),
    chunks: listed
  };
}
