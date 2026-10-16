import { describe, expect, it } from "vitest";
import { projectDigest, recentRepos, recentWorkDigest } from "@/lib/profile/project-digest";
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

function repoHeader(name: string, fields: Record<string, string>) {
  return chunk({
    kind: "github",
    path: `data/github/${name.toLowerCase()}.md`,
    title: name,
    section: name,
    chunkIndex: 0,
    content: [
      `Section: ${name}`,
      "",
      `# ${name}`,
      "",
      ...Object.entries(fields).map(([label, value]) => `- ${label}: ${value}`)
    ].join("\n")
  });
}

describe("recentRepos", () => {
  it("orders repos by last push, newest first, falling back to the created date", () => {
    const repos = recentRepos([
      repoHeader("Older", { Created: "2026-06-01", "Last pushed": "2026-07-01", Description: "An older agent." }),
      repoHeader("Newest", { Created: "2026-09-01", "Last pushed": "2026-10-10", Description: "The newest agent." }),
      repoHeader("NoPush", { Created: "2026-08-15", Description: "Created in August." })
    ]);

    expect(repos.map((repo) => [repo.title, repo.lastActive])).toEqual([
      ["Newest", "2026-10-10"],
      ["NoPush", "2026-08-15"],
      ["Older", "2026-07-01"]
    ]);
  });

  it("summarises a repo without a description from its README prose, skipping code", () => {
    const header = repoHeader("Field-Voice", { Created: "2026-06-17", Description: "None" });
    const readme = chunk({
      kind: "github",
      path: header.path,
      title: "Field-Voice",
      section: "README",
      chunkIndex: 1,
      content: [
        "Section: README",
        "",
        "```",
        "project/",
        "```",
        "| Part | Choice |",
        "A voice assistant that lets field technicians log work orders hands-free."
      ].join("\n")
    });

    const [repo] = recentRepos([readme, header]);

    expect(repo.summary).toBe(
      "A voice assistant that lets field technicians log work orders hands-free."
    );
    expect(repo.chunk).toBe(readme);
  });

  it("drops repos with no date or nothing to say", () => {
    expect(recentRepos([repoHeader("Bare", { Created: "2026-09-01", Description: "None" })])).toEqual([]);
    expect(recentRepos([repoHeader("Undated", { Description: "Has a description." })])).toEqual([]);
  });
});

describe("recentWorkDigest", () => {
  it("lists at most five repos with the month they were last active", () => {
    const repos = recentRepos(
      ["A", "B", "C", "D", "E", "F"].map((name, index) =>
        repoHeader(name, { "Last pushed": `2026-0${index + 1}-15`, Description: `Project ${name}.` })
      )
    );

    const digest = recentWorkDigest(repos);

    const bullets = digest?.answer.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets).toHaveLength(5);
    expect(bullets?.[0]).toBe("- F (Jun 2026): Project F.");
    expect(digest?.chunks.map((item) => item.title)).toEqual(["F", "E", "D", "C", "B"]);
  });

  it("returns null without any repos", () => {
    expect(recentWorkDigest([])).toBeNull();
  });
});

describe("projectDigest with recent repos", () => {
  it("names up to three recent repos that are not already listed", () => {
    const repos = recentRepos([
      repoHeader("Stock Lens", { "Last pushed": "2026-10-01", Description: "Portfolio analytics dashboard." }),
      repoHeader("Sentinel", { "Last pushed": "2026-10-15", Description: "Voice agent for bills." }),
      repoHeader("Review Pilot", { "Last pushed": "2026-09-03", Description: "PR review briefings." }),
      repoHeader("BlastRadius", { "Last pushed": "2026-07-10", Description: "Code graph for impact analysis." })
    ]);
    const listedRepo = { ...githubRepo, path: "data/github/stock lens.md" };

    const digest = projectDigest([commentSummary, listedRepo], repos);

    expect(digest?.answer).toContain(
      "His most recent work on GitHub: Sentinel, Review Pilot, BlastRadius."
    );
  });
});
