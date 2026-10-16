import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProfileSummary, parseProfileSummary } from "@/lib/profile-summary";

const resume = readFileSync(path.join(process.cwd(), "data", "resume.md"), "utf8");

describe("parseProfileSummary", () => {
  it("derives the landing summary from the resume", () => {
    expect(parseProfileSummary(resume)).toEqual({
      name: "Shubham Shah",
      positioning: "AI/ML engineer building LLM agents and RAG systems",
      highlights: [
        { label: "CommentAI", detail: "Autonomous AI agent; guardrails cut spam/irrelevant outputs by ~40%" },
        { label: "CCPA compliance AI system", detail: "Indexed 10k+ legal text chunks; retrieval precision up ~20%" },
        { label: "PDF grounded chatbot", detail: "Answers strictly from uploaded PDFs, with page-number citations" },
        { label: "CGPA 9.6 / 10", detail: "BITS Pilani Digital + Scaler School of Technology" }
      ],
      links: {
        github: "https://github.com/shubhamm-02",
        linkedin: "https://www.linkedin.com/in/shubham-shah2006/",
        email: "shubhamshah473@gmail.com"
      }
    });
  });

  it("only uses figures that appear in the resume", () => {
    for (const { label, detail } of parseProfileSummary(resume).highlights) {
      for (const figure of `${label} ${detail}`.match(/~?\d[\d.k+]*%?/g) ?? []) {
        expect(resume).toContain(figure);
      }
    }
  });

  it("fails loudly when a highlight's source disappears", () => {
    const withoutCcpa = resume.replace(/### CCPA[\s\S]*?(?=### )/, "");
    expect(() => parseProfileSummary(withoutCcpa)).toThrow(/project "CCPA"/);
  });

  it("fails loudly when a metric is reworded", () => {
    expect(() => parseProfileSummary(resume.replace("reducing spam", "cutting spam"))).toThrow(/CommentAI/);
  });
});

describe("getProfileSummary", () => {
  it("reads data/resume.md once", () => {
    expect(getProfileSummary()).toBe(getProfileSummary());
    expect(getProfileSummary().name).toBe("Shubham Shah");
  });
});
