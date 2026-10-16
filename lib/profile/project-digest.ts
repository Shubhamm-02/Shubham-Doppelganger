import { chunkBody, plainText } from "@/lib/profile/sources";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const MAX_PROJECTS = 5;
const METADATA_LINE =
  /^- (?:Project name|GitHub|Deployed app|Source|Created|Last pushed|Languages|Topics|Description):/;

function isProjectChunk(chunk: RetrievedChunk) {
  return (
    chunk.kind === "github" ||
    (chunk.kind === "project-note" && chunk.path.startsWith("data/project-notes/"))
  );
}

function projectSummary(chunk: RetrievedChunk) {
  const lines = chunkBody(chunk.content).split("\n").map((line) => line.trim());

  const description = lines
    .find((line) => line.startsWith("- Description:"))
    ?.replace(/^- Description:\s*/, "");
  if (description && /[a-z]/i.test(description) && !/^none$/i.test(description)) {
    return plainText(description);
  }

  const oneLineIndex = lines.findIndex((line) => /^## One-Line Summary/i.test(line));
  if (oneLineIndex >= 0) {
    const next = lines.slice(oneLineIndex + 1).find((line) => line && !line.startsWith("#"));
    if (next) return plainText(next);
  }

  const firstLine = lines.find(
    (line) => line && !line.startsWith("#") && !METADATA_LINE.test(line)
  );
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

export function projectDigest(chunks: RetrievedChunk[]) {
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

  return {
    answer: [
      "Shubham's strongest project examples include:",
      "",
      bullets,
      "",
      "These are relevant because they show practical work with RAG, agents, local LLMs, retrieval, guardrails, and deployed AI tools."
    ].join("\n"),
    chunks: listed
  };
}
