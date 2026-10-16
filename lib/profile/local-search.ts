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
  "about",
  "any",
  "by",
  "can",
  "could",
  "did",
  "does",
  "done",
  "for",
  "from",
  "had",
  "has",
  "have",
  "him",
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
  "she",
  // Every source is about Shubham, so his name never tells one from another.
  "shah",
  "shubham",
  "tell",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "work",
  "would",
  "you",
  "your"
]);

const EDUCATION_TERMS = ["education", "degree", "college", "scaler", "bits", "pilani", "cgpa"];
const ACHIEVEMENT_TERMS = ["hackathon", "hackhazard", "rank", "place", "certification"];

// Keys are stems (see `stem`), so "studying" and "grades" find them; values are stemmed on use.
const QUERY_SYNONYMS: Record<string, string[]> = {
  age: ["born", "birth", "birthday", "old", "year"],
  born: ["birth", "birthday", "age", "old", "year"],
  birthday: ["born", "birth", "age"],
  degree: ["bits", "pilani", "bsc", "computer", "science"],
  college: ["scaler", "school", "technology", "bits", "pilani"],
  study: EDUCATION_TERMS,
  student: EDUCATION_TERMS,
  university: EDUCATION_TERMS,
  grade: ["cgpa", "education", "score", "academic"],
  cgpa: ["grade", "education", "academic"],
  hobby: ["badminton", "gym", "fitness", "chess"],
  backend: ["api", "server", "spring", "boot", "database", "payment", "razorpay"],
  achievement: ACHIEVEMENT_TERMS,
  award: ACHIEVEMENT_TERMS,
  win: ACHIEVEMENT_TERMS,
  won: ACHIEVEMENT_TERMS,
  winner: ACHIEVEMENT_TERMS,
  hackathon: ["hackhazard", "rank"],
  certificate: ["certification", "forage", "simulation"]
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

// Crude suffix stripping, applied to questions and sources alike so both sides meet.
function stem(token: string) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("ied")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) {
    const base = token.slice(0, -3);
    return /([b-df-hj-np-tv-z])\1$/.test(base) ? base.slice(0, -1) : base;
  }
  if (token.length > 4 && token.endsWith("ed") && !token.endsWith("eed")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !/(?:ss|us)$/.test(token) && !(token.length > 4 && token.endsWith("is"))) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map(stem);
}

function expandQueryTokens(tokens: string[]) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of QUERY_SYNONYMS[token] ?? []) {
      expanded.add(stem(synonym));
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

function scoreChunk(
  chunk: DocumentChunk,
  queryTokens: string[],
  questionTokens: string[],
  wantsProjects: boolean
) {
  const contentTokens = new Set(tokenize(chunk.content));
  const overlap = queryTokens.filter((token) => contentTokens.has(token)).length;
  const sectionTitle = chunk.metadata.sectionTitle;
  const titleBoost =
    chunk.sourceType !== "resume" &&
    questionTokens.some((token) => compactName(chunk.sourceName).includes(compactName(token)))
      ? 3
      : 0;
  const sectionTokens = new Set(tokenize(sectionTitle));
  const sectionBoost = queryTokens.some((token) => sectionTokens.has(token)) ? 2 : 0;
  const boilerplatePenalty = /^(?:questions this note can answer|extra details to add later)$/i.test(
    sectionTitle
  )
    ? 4
    : 0;
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
  const questionTokens = tokenize(question);
  const queryTokens = expandQueryTokens(questionTokens);
  if (!queryTokens.length) return [];
  const wantsProjects = isProjectQuestion(question);

  return allChunks()
    .map((chunk) =>
      toRetrievedChunk(chunk, scoreChunk(chunk, queryTokens, questionTokens, wantsProjects))
    )
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

export function githubChunks(): RetrievedChunk[] {
  return allChunks()
    .filter((chunk) => chunk.sourceType === "github")
    .map((chunk) => toRetrievedChunk(chunk, 0));
}

export function wizardProjectChunks(): RetrievedChunk[] {
  return allChunks()
    .filter((chunk) => chunk.sourcePath === WIZARD_PROJECT_PATH)
    .map((chunk, index) => toRetrievedChunk(chunk, 14 - index * 0.2));
}
