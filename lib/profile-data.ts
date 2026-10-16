import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type ProfileSource = {
  id: string;
  title: string;
  kind: "resume" | "project-note" | "github";
  relativePath: string;
  content: string;
};

function dataPath(...segments: string[]) {
  return path.join(process.cwd(), "data", ...segments);
}

function titleFromMarkdown(content: string, fallback: string) {
  const firstHeading = content
    .split("\n")
    .find((line) => line.trim().startsWith("# "));

  return firstHeading?.replace(/^#\s+/, "").trim() || fallback;
}

function loadMarkdownDirectory(
  directory: string,
  kind: ProfileSource["kind"],
  idPrefix = ""
): ProfileSource[] {
  if (!existsSync(dataPath(directory))) return [];

  return readdirSync(dataPath(directory))
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .map((fileName) => {
      const content = readFileSync(dataPath(directory, fileName), "utf8");
      return {
        id: `${idPrefix}${fileName.replace(/\.md$/, "")}`,
        title: titleFromMarkdown(content, fileName),
        kind,
        relativePath: `data/${directory}/${fileName}`,
        content
      };
    });
}

export function loadProfileSources(): ProfileSource[] {
  const sources: ProfileSource[] = [];
  const resumeFile = dataPath("resume.md");

  if (existsSync(resumeFile)) {
    const content = readFileSync(resumeFile, "utf8");
    sources.push({
      id: "resume",
      title: titleFromMarkdown(content, "Resume"),
      kind: "resume",
      relativePath: "data/resume.md",
      content
    });
  }

  const personalBackgroundFile = dataPath("personal-background.md");
  if (existsSync(personalBackgroundFile)) {
    const content = readFileSync(personalBackgroundFile, "utf8");
    sources.push({
      id: "personal-background",
      title: titleFromMarkdown(content, "Personal Background"),
      kind: "project-note",
      relativePath: "data/personal-background.md",
      content
    });
  }

  sources.push(
    ...loadMarkdownDirectory("project-notes", "project-note"),
    ...loadMarkdownDirectory("github", "github", "github-")
  );

  return sources;
}
