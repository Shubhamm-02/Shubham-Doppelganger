import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProfileSummary, parseProfileSummary } from "@/lib/profile-summary";

const resume = readFileSync(path.join(process.cwd(), "data", "resume.md"), "utf8");

describe("parseProfileSummary", () => {
  it("derives the landing summary from the resume", () => {
    expect(parseProfileSummary(resume)).toEqual({
      name: "Shubham Shah",
      positioning: "Software engineer focused on AI/ML, LLM systems, and full-stack development",
      highlights: [
        {
          label: "HACKHAZARDS '26",
          detail: "Placed 5th overall and 3rd in the Neo4j Track with BlastRadius, among 2,657 submissions"
        },
        { label: "TRAE Hackathon", detail: "1st place in the Nasiko Track with an agent load balancing system" },
        {
          label: "Galaxy AI Workflow Builder",
          detail: "Typed DAG validation, full/single/partial workflow runs, and background execution"
        },
        {
          label: "BITS Pilani Digital + Scaler School of Technology",
          detail: "B.Sc. in Computer Science Engineering + M.Sc. from Woolf University"
        }
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
      for (const figure of `${label} ${detail}`.match(/~?\d[\d.,k+]*%?/g) ?? []) {
        expect(resume).toContain(figure);
      }
    }
  });

  it("states no grades", () => {
    const summary = JSON.stringify(parseProfileSummary(resume));
    expect(summary).not.toMatch(/cgpa|cgr|gpa/i);
  });

  it("fails loudly when a highlight's source disappears", () => {
    const withoutHackhazards = resume.replace(/### HACKHAZARDS[\s\S]*?(?=### )/, "");
    expect(() => parseProfileSummary(withoutHackhazards)).toThrow(/entry "HACKHAZARDS"/);
  });

  it("fails loudly when a detail is reworded", () => {
    expect(() =>
      parseProfileSummary(resume.replace("final project submissions", "project entries"))
    ).toThrow(/HACKHAZARDS/);
  });
});

describe("getProfileSummary", () => {
  it("reads data/resume.md once", () => {
    expect(getProfileSummary()).toBe(getProfileSummary());
    expect(getProfileSummary().name).toBe("Shubham Shah");
  });
});
