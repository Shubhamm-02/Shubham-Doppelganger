import { buildProfileChunks, type DocumentChunk } from "@/lib/chunking";
import { isProjectQuestion } from "@/lib/profile/question";
import type { RetrievedChunk } from "@/lib/retrieval/types";

export const WIZARD_PROJECT_PATH = "data/project-notes/shubham-doppelganger.md";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "his",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  // Every source is about Shubham, so his name never tells one from another.
  "shah",
  "shubham",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
  "your"
]);

const QUERY_SYNONYMS: Record<string, string[]> = {
  age: ["born", "birth", "birthday", "old", "years"],
  born: ["birth", "birthday", "age", "old", "years"],
  birthday: ["born", "birth", "age"],
  degree: ["bits", "pilani", "bsc", "computer", "science"],
  college: ["scaler", "school", "technology", "bits", "pilani"],
  hobbies: ["badminton", "gym", "fitness", "chess"],
  hobby: ["badminton", "gym", "fitness", "chess"]
};

const KNOWN_PROJECT_NAMES = [
  "Wizard - Shubham Shah AI Representative",
  "PDF-Grounded Chatbot",
  "CommentAI",
  "CCPA Compliance Reasoning System",
  "CLI Agent"
].map(compactName);

const PROFILE_OVERVIEW_PATHS = new Set(["data/resume.md", "data/personal-background.md"]);
const PROFILE_OVERVIEW_SECTIONS = new Set([
  "Profile",
  "Technical Skills",
  "Education",
  "Basic Details",
  "Scaler School Of Technology",
  "Degree And Academic Structure",
  "Hobbies And Fitness"
]);

let profileChunks: DocumentChunk[] | null = null;

function allChunks() {
  profileChunks ??= buildProfileChunks();
  return profileChunks;
}

function compactName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function expandQueryTokens(tokens: string[]) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of QUERY_SYNONYMS[token] ?? []) {
      expanded.add(synonym);
    }
  }
  return Array.from(expanded);
}

function isProjectKind(kind: string) {
  return kind === "project-note" || kind === "github";
}

function toRetrievedChunk(chunk: DocumentChunk, score: number): RetrievedChunk {
  return {
    documentId: null,
    kind: chunk.sourceType,
    path: chunk.sourcePath,
    title: chunk.sourceName,
    section: chunk.metadata.sectionTitle,
    chunkIndex: chunk.chunkIndex,
    url: chunk.sourceUrl,
    content: chunk.content,
    score
  };
}

function scoreChunk(chunk: DocumentChunk, queryTokens: string[], wantsProjects: boolean) {
  const contentTokens = new Set(tokenize(chunk.content));
  const overlap = queryTokens.filter((token) => contentTokens.has(token)).length;
  const sectionTitle = chunk.metadata.sectionTitle;
  const titleBoost =
    chunk.sourceType !== "resume" &&
    queryTokens.some((token) => compactName(chunk.sourceName).includes(compactName(token)))
      ? 3
      : 0;
  const sectionBoost = queryTokens.some((token) => sectionTitle.toLowerCase().includes(token))
    ? 2
    : 0;
  const boilerplatePenalty = /questions this note can answer/i.test(sectionTitle) ? 4 : 0;
  const projectNoteBias = isProjectKind(chunk.sourceType) ? (wantsProjects ? 4 : 0.5) : 0;
  const resumeProjectPenalty =
    wantsProjects &&
    chunk.sourceType === "resume" &&
    /^(shubham shah|projects)$/i.test(sectionTitle)
      ? 2
      : 0;
  const knownProjectBoost =
    wantsProjects &&
    KNOWN_PROJECT_NAMES.some((name) => compactName(chunk.sourceName).includes(name))
      ? 1.5
      : 0;

  return (
    overlap +
    titleBoost +
    sectionBoost +
    projectNoteBias -
    boilerplatePenalty -
    resumeProjectPenalty +
    knownProjectBoost
  );
}

export function searchLocalChunks(question: string): RetrievedChunk[] {
  const queryTokens = expandQueryTokens(tokenize(question));
  if (!queryTokens.length) return [];
  const wantsProjects = isProjectQuestion(question);

  return allChunks()
    .map((chunk) => toRetrievedChunk(chunk, scoreChunk(chunk, queryTokens, wantsProjects)))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function profileOverviewChunks(): RetrievedChunk[] {
  return allChunks()
    .filter(
      (chunk) =>
        PROFILE_OVERVIEW_PATHS.has(chunk.sourcePath) &&
        PROFILE_OVERVIEW_SECTIONS.has(chunk.metadata.sectionTitle)
    )
    .map((chunk, index) => toRetrievedChunk(chunk, 10 - index * 0.2));
}

export function wizardProjectChunks(): RetrievedChunk[] {
  return allChunks()
    .filter((chunk) => chunk.sourcePath === WIZARD_PROJECT_PATH)
    .map((chunk, index) => toRetrievedChunk(chunk, 14 - index * 0.2));
}
