import { createHash } from "node:crypto";
import { loadProfileSources, type ProfileSource } from "@/lib/profile-data";

export type DocumentChunk = {
  sourceType: ProfileSource["kind"];
  sourceName: string;
  sourcePath: string;
  sourceUrl: string | null;
  chunkIndex: number;
  content: string;
  contentHash: string;
  metadata: {
    sourceId: string;
    sourceTitle: string;
    sourcePath: string;
    sectionTitle: string;
    sectionIndex: number;
  };
};

type MarkdownSection = {
  title: string;
  index: number;
  content: string;
};

const MAX_CHUNK_CHARS = 2400;

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function extractSourceUrl(content: string) {
  const gitHubMatch = content.match(/GitHub:\s*(https?:\/\/\S+)/i);
  if (gitHubMatch?.[1]) return gitHubMatch[1];

  const deployedMatch = content.match(/Deployed app:\s*(https?:\/\/\S+)/i);
  if (deployedMatch?.[1]) return deployedMatch[1];

  const firstUrl = content.match(/https?:\/\/[^\s)]+/);
  return firstUrl?.[0] ?? null;
}

function splitMarkdownIntoSections(source: ProfileSource): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = source.content.split("\n");
  let currentTitle = source.title;
  let currentLines: string[] = [];
  let sectionIndex = 0;

  function flush() {
    const content = currentLines.join("\n").trim();
    if (!content) return;

    sections.push({
      title: currentTitle,
      index: sectionIndex,
      content
    });
    sectionIndex += 1;
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flush();
      currentTitle = heading[2].trim();
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  flush();
  return sections.length
    ? sections
    : [
        {
          title: source.title,
          index: 0,
          content: source.content
        }
      ];
}

function splitLongSection(section: MarkdownSection) {
  const paragraphs = section.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= MAX_CHUNK_CHARS) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= MAX_CHUNK_CHARS) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += MAX_CHUNK_CHARS) {
      chunks.push(paragraph.slice(index, index + MAX_CHUNK_CHARS).trim());
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

export function buildProfileChunks(): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const source of loadProfileSources()) {
    const sourceUrl = extractSourceUrl(source.content);
    const sections = splitMarkdownIntoSections(source);

    for (const section of sections) {
      for (const sectionChunk of splitLongSection(section)) {
        const content = [
          `Source: ${source.title}`,
          `Source path: ${source.relativePath}`,
          `Section: ${section.title}`,
          "",
          sectionChunk
        ].join("\n");

        chunks.push({
          sourceType: source.kind,
          sourceName: source.title,
          sourcePath: source.relativePath,
          sourceUrl,
          chunkIndex: chunks.filter(
            (chunk) => chunk.sourcePath === source.relativePath
          ).length,
          content,
          contentHash: hashContent(content),
          metadata: {
            sourceId: source.id,
            sourceTitle: source.title,
            sourcePath: source.relativePath,
            sectionTitle: section.title,
            sectionIndex: section.index
          }
        });
      }
    }
  }

  return chunks;
}
