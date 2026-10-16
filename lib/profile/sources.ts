import type { Source } from "@/lib/chat/types";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const MAX_SOURCES = 4;
const SNIPPET_LENGTH = 280;

export function chunkBody(content: string) {
  return content.replace(/^(?:Source|Source path|Section):.*$/gm, "").trim();
}

export function plainText(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function snippet(content: string) {
  const text = plainText(
    chunkBody(content)
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !/^#{1,6}\s/.test(line) &&
          !line.startsWith("```") &&
          !/^[-*]?\s*[A-Za-z ]+:\s*(?:https?:\/\/\S+|\d{4}-\d{2}-\d{2}|none)$/i.test(line)
      )
      .map((line) => line.replace(/^(?:[-*+]|\d+[.)])\s+/, ""))
      .join(" ")
  ).replace(/\s+/g, " ");

  if (text.length <= SNIPPET_LENGTH) return text;
  const cut = text.slice(0, SNIPPET_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > SNIPPET_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function toSources(chunks: RetrievedChunk[]): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const key = `${chunk.path}\n${chunk.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      id: `${chunk.path}#${chunk.chunkIndex}`,
      path: chunk.path,
      title: chunk.title,
      section: chunk.section,
      snippet: snippet(chunk.content),
      url: chunk.url
    });
    if (sources.length === MAX_SOURCES) break;
  }

  return sources;
}
