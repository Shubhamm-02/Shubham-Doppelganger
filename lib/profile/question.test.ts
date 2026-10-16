import { describe, expect, it } from "vitest";
import {
  isProfileOverviewQuestion,
  isProjectListQuestion,
  isProjectQuestion,
  isRecentWorkQuestion,
  isWizardProjectQuestion,
  normalizeProfileQuestion
} from "@/lib/profile/question";

describe("normalizeProfileQuestion", () => {
  it("repairs common mishearings of Shubham's name", () => {
    expect(normalizeProfileQuestion("What did Shivam build?")).toBe("What did Shubham build?");
    expect(normalizeProfileQuestion("Tell me about subham's projects")).toBe(
      "Tell me about Shubham's projects"
    );
    expect(normalizeProfileQuestion("Is chubham shah available?")).toBe("Is Shubham shah available?");
  });

  it("leaves other words alone", () => {
    expect(normalizeProfileQuestion("Which shivaay project?")).toBe("Which shivaay project?");
  });
});

describe("question classifiers", () => {
  it("detects project questions", () => {
    expect(isProjectQuestion("What has he built?")).toBe(true);
    expect(isProjectQuestion("Show me his GitHub repos")).toBe(true);
    expect(isProjectQuestion("Where did he study?")).toBe(false);
  });

  it("treats only requests for a list of projects as project-list questions", () => {
    expect(isProjectListQuestion("What projects has Shubham built?")).toBe(true);
    expect(isProjectListQuestion("Tell me about his portfolio")).toBe(true);
    expect(isProjectListQuestion("Which projects use RAG?")).toBe(false);
    expect(isProjectListQuestion("How does the PDF chatbot project avoid hallucinations?")).toBe(false);
    expect(isProjectListQuestion("What did Shubham build first?")).toBe(false);
  });

  it("detects questions about this Wizard project", () => {
    expect(isWizardProjectQuestion("How does the voice agent book calls?")).toBe(true);
    expect(isWizardProjectQuestion("Tell me about this project")).toBe(true);
    expect(isWizardProjectQuestion("What does CommentAI do?")).toBe(false);
  });

  it("detects profile overview questions", () => {
    expect(isProfileOverviewQuestion("Tell me about Shubham")).toBe(true);
    expect(isProfileOverviewQuestion("Give me a brief summary of shivam")).toBe(true);
    expect(isProfileOverviewQuestion("Who is he?")).toBe(true);
    expect(isProfileOverviewQuestion("Tell me about CommentAI")).toBe(false);
  });
});

describe("isRecentWorkQuestion", () => {
  it.each([
    "What are his recent projects?",
    "What has Shubham built lately?",
    "What is he working on right now?",
    "What are the latest repos on his GitHub?",
    "What has he been up to recently?"
  ])("treats %j as a question about recent work", (question) => {
    expect(isRecentWorkQuestion(question)).toBe(true);
  });

  it.each(["What's his latest CGPA?", "What projects has he done?", "Is he available right now?"])(
    "leaves %j to the normal path",
    (question) => {
      expect(isRecentWorkQuestion(question)).toBe(false);
    }
  );
});
