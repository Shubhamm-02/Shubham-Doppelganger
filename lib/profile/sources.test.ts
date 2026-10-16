import { describe, expect, it } from "vitest";
import { toSources } from "@/lib/profile/sources";
import type { RetrievedChunk } from "@/lib/retrieval/types";

function chunk(overrides: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    documentId: null,
    kind: "project-note",
    path: "data/project-notes/comment-ai.md",
    title: "Comment AI",
    section: "What It Does",
    chunkIndex: 0,
    url: "https://github.com/Shubhamm-02/CommentAI",
    content: "Source: Comment AI\nSource path: data/project-notes/comment-ai.md\nSection: What It Does\n\n## What It Does\n\nGenerates comments.",
    score: 1,
    ...overrides
  };
}

describe("toSources", () => {
  it("builds chunk-level sources with clean snippets", () => {
    const [source] = toSources([
      chunk({
        chunkIndex: 3,
        content: [
          "Source: Comment AI",
          "Source path: data/project-notes/comment-ai.md",
          "Section: Anti-Spam Guardrails",
          "",
          "### Anti-Spam Guardrails",
          "",
          "- **Rate limits** keep posting _slow_ and `deduplicated`.",
          "- See [the dashboard](https://example.com/dash) for activity.",
          "- GitHub: https://github.com/Shubhamm-02/CommentAI"
        ].join("\n"),
        section: "Anti-Spam Guardrails"
      })
    ]);

    expect(source).toEqual({
      id: "data/project-notes/comment-ai.md#3",
      path: "data/project-notes/comment-ai.md",
      title: "Comment AI",
      section: "Anti-Spam Guardrails",
      snippet: "Rate limits keep posting slow and deduplicated. See the dashboard for activity.",
      url: "https://github.com/Shubhamm-02/CommentAI"
    });
  });

  it("keeps snake_case identifiers intact", () => {
    const [source] = toSources([
      chunk({ content: "Section: X\n\nCalls match_documents with a_threshold." })
    ]);

    expect(source.snippet).toBe("Calls match_documents with a_threshold.");
  });

  it("caps snippets at 280 characters on a word boundary", () => {
    const [source] = toSources([chunk({ content: `Section: X\n\n${"word ".repeat(100)}` })]);

    expect(source.snippet.length).toBeLessThanOrEqual(280);
    expect(source.snippet.endsWith("word…")).toBe(true);
  });

  it("dedupes repeated sections and returns at most four sources", () => {
    const sources = toSources([
      chunk({ chunkIndex: 0, section: "A" }),
      chunk({ chunkIndex: 1, section: "A" }),
      chunk({ chunkIndex: 2, section: "B" }),
      chunk({ path: "data/resume.md", title: "Shubham Shah", section: "A", url: null }),
      chunk({ chunkIndex: 3, section: "C" }),
      chunk({ chunkIndex: 4, section: "D" })
    ]);

    expect(sources.map((source) => source.id)).toEqual([
      "data/project-notes/comment-ai.md#0",
      "data/project-notes/comment-ai.md#2",
      "data/resume.md#0",
      "data/project-notes/comment-ai.md#3"
    ]);
  });

  it("treats GitHub snapshots like project notes", () => {
    const [source] = toSources([
      chunk({
        kind: "github",
        path: "data/github/stock-lens.md",
        title: "Stock Lens",
        section: "Stock Lens",
        url: "https://github.com/Shubhamm-02/Stock-Lens",
        content: [
          "Source: Stock Lens",
          "Source path: data/github/stock-lens.md",
          "Section: Stock Lens",
          "",
          "# Stock Lens",
          "",
          "- GitHub: https://github.com/Shubhamm-02/Stock-Lens",
          "- Created: 2026-08-01",
          "- Languages: TypeScript",
          "- Topics: None",
          "- Description: Portfolio analytics dashboard."
        ].join("\n")
      })
    ]);

    expect(source).toMatchObject({
      id: "data/github/stock-lens.md#0",
      title: "Stock Lens",
      snippet: "Languages: TypeScript Description: Portfolio analytics dashboard.",
      url: "https://github.com/Shubhamm-02/Stock-Lens"
    });
  });
});
