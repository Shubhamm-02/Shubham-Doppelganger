import { describe, expect, it } from "vitest";
import type { GitHubRepo } from "@/lib/github/client";
import { renderSnapshot, skipReason, snapshotFileName, type SkipRules } from "@/lib/github/snapshot";

function repo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  const name = overrides.name ?? "BlastRadius";
  return {
    name,
    fullName: `Shubhamm-02/${name}`,
    htmlUrl: `https://github.com/Shubhamm-02/${name}`,
    description: null,
    fork: false,
    archived: false,
    createdAt: "2026-07-10T08:12:00Z",
    pushedAt: "2026-07-13T21:40:00Z",
    topics: [],
    ...overrides
  };
}

const NOTES = [
  {
    path: "data/project-notes/cli-agent.md",
    content: "# CLI-Agent\n\n## Source\n\n- GitHub: https://github.com/Shubhamm-02/CLI-Agent\n"
  },
  {
    path: "data/project-notes/comment-ai.md",
    content: "# Comment AI\n\n- **GitHub:** https://github.com/shubhamm-02/commentai\n"
  },
  {
    path: "data/project-notes/http-server.md",
    content:
      "# HTTP Server Assignment\n\nThis is my HTTP server implementation for the Computer Networks assignment. I built it from scratch."
  },
  { path: "data/project-notes/bits-sga.md", content: "# Library CRUD Spring Boot Application" },
  { path: "data/project-notes/lld.md", content: "this repo contains all the assignments for lld" },
  { path: "data/project-notes/scalerite.md", content: "# scAlerite — College Academic Chatbot" }
];

const RULES: SkipRules = {
  exclude: ["Shubham-Doppelganger", "Shubhamm-02", "skills-introduction-to-github"],
  include: [],
  createdAfter: "2026-06-06",
  notes: NOTES
};

describe("skipReason", () => {
  it("skips repos created on or before the cutoff unless included", () => {
    expect(skipReason(repo({ createdAt: "2026-06-06T23:00:00Z" }), RULES)).toBe(
      "created before 2026-06-06"
    );
    expect(skipReason(repo({ createdAt: "2026-06-07T00:10:00Z" }), RULES)).toBeNull();
    expect(
      skipReason(repo({ name: "Lexguard", createdAt: "2026-05-17T10:00:00Z" }), {
        ...RULES,
        include: ["Lexguard"]
      })
    ).toBeNull();
  });

  it("skips excluded names case-insensitively", () => {
    expect(skipReason(repo({ name: "shubham-doppelganger" }), RULES)).toBe("excluded");
    expect(skipReason(repo({ name: "Shubhamm-02" }), RULES)).toBe("excluded");
  });

  it("skips forks and archived repos unless included", () => {
    expect(skipReason(repo({ fork: true }), RULES)).toBe("fork");
    expect(skipReason(repo({ archived: true }), RULES)).toBe("archived");
    expect(skipReason(repo({ fork: true }), { ...RULES, include: ["blastradius"] })).toBeNull();
  });

  it("skips repos linked from a curated note's GitHub line", () => {
    expect(skipReason(repo({ name: "CLI-Agent" }), RULES)).toBe(
      "covered by data/project-notes/cli-agent.md"
    );
    expect(skipReason(repo({ name: "CommentAI" }), RULES)).toBe(
      "covered by data/project-notes/comment-ai.md"
    );
    expect(skipReason(repo({ name: "CommentAI-Extension" }), RULES)).toBeNull();
  });

  it("skips repos whose name contains a curated note's file name", () => {
    expect(skipReason(repo({ name: "BITS_SGA_2_BDA_Shubham" }), RULES)).toBe(
      "covered by data/project-notes/bits-sga.md"
    );
    expect(skipReason(repo({ name: "SST28-LLD101" }), RULES)).toBe(
      "covered by data/project-notes/lld.md"
    );
    expect(skipReason(repo({ name: "scAlerite" }), RULES)).toBe(
      "covered by data/project-notes/scalerite.md"
    );
    expect(skipReason(repo({ name: "Lexguard" }), RULES)).toBeNull();
    expect(skipReason(repo({ name: "Field-Voice" }), RULES)).toBeNull();
  });

  it("skips repos whose description a curated note quotes, but not on short descriptions", () => {
    const description =
      "This is my HTTP server implementation for the Computer Networks assignment.";
    expect(skipReason(repo({ name: "CN_Final_HTTP_Project", description }), RULES)).toBe(
      "covered by data/project-notes/http-server.md"
    );
    expect(skipReason(repo({ name: "Adv-DB", description: "HTTP Server Assignment" }), RULES)).toBeNull();
  });

  it("keeps everything else", () => {
    expect(skipReason(repo({ description: "Maps a codebase into a graph" }), RULES)).toBeNull();
  });
});

describe("snapshotFileName", () => {
  it("lowercases and kebab-cases repo names", () => {
    expect(snapshotFileName("Review_Pilot")).toBe("review-pilot.md");
    expect(snapshotFileName("zenith-portfolio-mock-stock-manager-MERN-Project-")).toBe(
      "zenith-portfolio-mock-stock-manager-mern-project.md"
    );
    expect(snapshotFileName("GenAI-Assignment-03")).toBe("genai-assignment-03.md");
  });
});

describe("renderSnapshot", () => {
  it("renders the fixed header followed by the cleaned README", () => {
    const snapshot = renderSnapshot({
      repo: repo({
        name: "Review_Pilot",
        description: "  An AI agent that\nreviews pull requests  ",
        topics: ["python", "ai-agents"]
      }),
      languages: { CSS: 120, Python: 9000, Dockerfile: 120 },
      readme: "# Review Pilot\n\nTurns a pull request into a briefing."
    });

    expect(snapshot).toBe(
      [
        "# Review_Pilot",
        "",
        "- GitHub: https://github.com/Shubhamm-02/Review_Pilot",
        "- Created: 2026-07-10",
        "- Last pushed: 2026-07-13",
        "- Languages: Python, CSS, Dockerfile",
        "- Topics: ai-agents, python",
        "- Description: An AI agent that reviews pull requests",
        "",
        "## README",
        "",
        "# Review Pilot",
        "",
        "Turns a pull request into a briefing.",
        ""
      ].join("\n")
    );
  });

  it("writes None for missing languages, topics and description", () => {
    const snapshot = renderSnapshot({ repo: repo(), languages: {}, readme: "Hello." });

    expect(snapshot).toContain("- Languages: None\n- Topics: None\n- Description: None\n");
  });
});
