import { describe, expect, it, vi } from "vitest";
import { buildProfileChunks } from "@/lib/chunking";

vi.mock("@/lib/profile-data", () => ({
  loadProfileSources: () => [
    {
      id: "github-review-pilot",
      title: "Review_Pilot",
      kind: "github",
      relativePath: "data/github/review-pilot.md",
      content: [
        "# Review_Pilot",
        "",
        "- GitHub: https://github.com/Shubhamm-02/Review_Pilot",
        "- Description: Reviews pull requests",
        "",
        "## README",
        "",
        "See https://example.com/docs for details.",
        "",
        "## Install",
        "",
        "## Setup",
        "",
        "```bash",
        "# install dependencies",
        "pip install -r requirements.txt",
        "```",
        "",
        "## Usage",
        "",
        "Run it."
      ].join("\n")
    }
  ]
}));

describe("buildProfileChunks", () => {
  it("indexes GitHub snapshots with their kind and header URL", () => {
    const chunks = buildProfileChunks();

    expect(chunks.every((chunk) => chunk.sourceType === "github")).toBe(true);
    expect(chunks.every((chunk) => chunk.sourceUrl === "https://github.com/Shubhamm-02/Review_Pilot")).toBe(
      true
    );
  });

  it("does not treat comment lines inside code fences as section headings", () => {
    const sections = buildProfileChunks().map((chunk) => chunk.metadata.sectionTitle);

    expect(sections).toEqual(["Review_Pilot", "README", "Setup", "Usage"]);
  });

  it("skips a heading with nothing under it", () => {
    const chunks = buildProfileChunks();

    expect(chunks.map((chunk) => chunk.metadata.sectionTitle)).not.toContain("Install");
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2, 3]);
  });
});
