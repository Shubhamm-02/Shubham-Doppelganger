import { describe, expect, it } from "vitest";
import { projectDigest } from "@/lib/profile/project-digest";
import type { RetrievedChunk } from "@/lib/retrieval/types";

function chunk(overrides: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    documentId: null,
    kind: "project-note",
    path: "data/project-notes/comment-ai.md",
    title: "Comment AI",
    section: "Setup",
    chunkIndex: 0,
    url: null,
    content: "Section: Setup\n\n## Setup\n\nRun npm install.",
    score: 1,
    ...overrides
  };
}

const commentSummary = chunk({
  chunkIndex: 1,
  section: "One-Line Summary",
  content: "Section: One-Line Summary\n\n## One-Line Summary\n\n**CommentAI** posts comments with Llama 3."
});

const githubRepo = chunk({
  kind: "github",
  path: "data/github/stock-lens.md",
  title: "Stock Lens",
  section: "Stock Lens",
  content: [
    "Section: Stock Lens",
    "",
    "# Stock Lens",
    "",
    "- GitHub: https://github.com/Shubhamm-02/Stock-Lens",
    "- Created: 2026-08-01",
    "- Description: Portfolio analytics dashboard."
  ].join("\n")
});

describe("projectDigest", () => {
  it("summarises each project once from its best chunk", () => {
    const digest = projectDigest([chunk({}), commentSummary]);

    expect(digest?.answer).toContain("- Comment AI: CommentAI posts comments with Llama 3.");
    expect(digest?.answer.match(/Comment AI/g)).toHaveLength(1);
    expect(digest?.chunks).toEqual([commentSummary]);
  });

  it("lists GitHub snapshots after curated notes, described by their header", () => {
    const digest = projectDigest([githubRepo, commentSummary]);

    expect(digest?.answer.split("\n").filter((line) => line.startsWith("- "))).toEqual([
      "- Comment AI: CommentAI posts comments with Llama 3.",
      "- Stock Lens: Portfolio analytics dashboard."
    ]);
  });

  it("summarises a GitHub snapshot without a description from its README", () => {
    const header = chunk({
      ...githubRepo,
      content: "Section: Stock Lens\n\n# Stock Lens\n\n- Topics: None\n- Description: None"
    });
    const readmeHeading = chunk({ ...githubRepo, chunkIndex: 1, section: "README", content: "## README" });
    const readme = chunk({
      ...githubRepo,
      chunkIndex: 2,
      content: "Section: Stock Lens\n\n# Stock Lens\n\nTracks a mock portfolio."
    });

    const digest = projectDigest([readme, header, readmeHeading]);

    expect(digest?.answer).toContain("- Stock Lens: Tracks a mock portfolio.");
    expect(digest?.chunks).toEqual([readme]);
  });

  it("ignores the resume and personal background", () => {
    expect(
      projectDigest([
        chunk({ kind: "resume", path: "data/resume.md" }),
        chunk({ path: "data/personal-background.md" })
      ])
    ).toBeNull();
  });

  it("lists at most five projects", () => {
    const chunks = Array.from({ length: 7 }, (_, index) =>
      chunk({ path: `data/project-notes/p${index}.md`, title: `Project ${index}` })
    );

    expect(projectDigest(chunks)?.chunks).toHaveLength(5);
  });
});
