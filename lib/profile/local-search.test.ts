import { describe, expect, it } from "vitest";
import {
  profileOverviewChunks,
  searchLocalChunks,
  WIZARD_PROJECT_PATH,
  wizardProjectChunks
} from "@/lib/profile/local-search";

describe("searchLocalChunks", () => {
  it.each([
    ["How does the PDF Grounded Chatbot avoid hallucinations?", "data/project-notes/pdf-grounded-chatbot.md"],
    ["What anti-spam guardrails are in CommentAI?", "data/project-notes/comment-ai.md"],
    ["What role does FAISS play in the CCPA project?", "data/project-notes/ccpa-compliance-system.md"],
    ["How does the agent loop in CLI-Agent work?", "data/project-notes/cli-agent.md"],
    ["What are Shubham's hobbies?", "data/personal-background.md"],
    ["What did Shubham build at CommentAI?", "data/project-notes/comment-ai.md"],
    ["What are Shubham Shah's skills?", "data/resume.md"],
    ["Where does Shubham study?", "data/personal-background.md"],
    ["What backend work has he done outside of AI?", "data/resume.md"]
  ])("ranks the right note first for %j", (question, path) => {
    const [top] = searchLocalChunks(question);

    expect(top.path).toBe(path);
  });

  it("finds the matching section inside a note", () => {
    expect(searchLocalChunks("What anti-spam guardrails are in CommentAI?")[0].section).toBe(
      "Anti-Spam Guardrails"
    );
  });

  it("matches inflected words and ignores filler like \"does\"", () => {
    const sections = searchLocalChunks("Where is he studying, and how are his grades?")
      .slice(0, 4)
      .map((chunk) => `${chunk.path} :: ${chunk.section}`);

    expect(sections).toContain("data/resume.md :: Education");
    expect(sections.some((section) => section.endsWith(":: What It Does"))).toBe(false);
  });

  it("keeps placeholder sections out of the top results", () => {
    const sections = searchLocalChunks("What's the most complex system he's built end to end?")
      .slice(0, 4)
      .map((chunk) => chunk.section);

    expect(sections).not.toContain("Extra Details To Add Later");
  });

  it("returns chunks sorted by descending score", () => {
    const scores = searchLocalChunks("What role does FAISS play in the CCPA project?").map(
      (chunk) => chunk.score
    );

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("returns nothing when the question has no searchable words", () => {
    expect(searchLocalChunks("is it?")).toEqual([]);
  });
});

describe("fixed document sets", () => {
  it("serves the renamed Wizard note", () => {
    const chunks = wizardProjectChunks();

    expect(WIZARD_PROJECT_PATH).toBe("data/project-notes/shubham-doppelganger.md");
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((chunk) => chunk.path === WIZARD_PROJECT_PATH)).toBe(true);
  });

  it("serves the overview sections from the resume and personal background", () => {
    const sections = profileOverviewChunks().map((chunk) => chunk.section);

    expect(sections).toEqual(
      expect.arrayContaining(["Profile", "Technical Skills", "Education", "Hobbies And Fitness"])
    );
  });
});
