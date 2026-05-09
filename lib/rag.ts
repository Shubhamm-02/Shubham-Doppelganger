import { buildProfileChunks, type DocumentChunk } from "@/lib/chunking";
import {
  embedTexts,
  generateGroundedAnswer,
  hasOpenAIConfig,
  isModelRefusal
} from "@/lib/openai-client";
import { searchProfileSources } from "@/lib/profile-data";
import { hasSupabaseConfig } from "@/lib/supabase";
import { tryLogConversation, matchDocuments } from "@/lib/vector-store";

export type ProfileAnswer = {
  answer: string;
  citations: string[];
  grounded: boolean;
  retrievalMode: "supabase-vector" | "local-keyword" | "calendar";
};

const REFUSAL =
  "I do not have that information in the local resume or project notes yet.";

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
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
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

const KNOWN_PROJECT_NAMES = [
  "PDF-Grounded Chatbot",
  "CommentAI",
  "CCPA Compliance Reasoning System",
  "CLI Agent"
];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function excerpt(content: string) {
  const cleaned = content
    .replace(/^Source:.*$/gm, "")
    .replace(/^Source path:.*$/gm, "")
    .trim();

  return cleaned.length > 850 ? `${cleaned.slice(0, 850).trim()}...` : cleaned;
}

function firstMeaningfulLine(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("- Project name:") &&
        !line.startsWith("- GitHub:") &&
        !line.startsWith("- Deployed app:") &&
        !line.startsWith("- Source:")
    );
}

function isProjectQuestion(question: string) {
  return /\b(project|projects|built|github|portfolio|repo|repos)\b/i.test(question);
}

function cleanMarkdown(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function findOneLineSummary(chunk: DocumentChunk) {
  const lines = chunk.content.split("\n").map((line) => line.trim());
  const oneLineIndex = lines.findIndex((line) => /^## One-Line Summary/i.test(line));
  if (oneLineIndex >= 0) {
    const next = lines.slice(oneLineIndex + 1).find((line) => line && !line.startsWith("#"));
    if (next) return cleanMarkdown(next);
  }

  const firstLine = firstMeaningfulLine(chunk.content);
  return firstLine ? cleanMarkdown(firstLine.replace(/^-\s*/, "")) : "";
}

function formatProjectAnswer(matches: Array<{ chunk: DocumentChunk; score: number }>) {
  const byProject = new Map<string, DocumentChunk>();

  for (const match of matches) {
    const chunk = match.chunk;
    if (chunk.sourceType !== "project-note") continue;
    if (!byProject.has(chunk.sourceName)) {
      byProject.set(chunk.sourceName, chunk);
    }
  }

  const chunks = Array.from(byProject.values());
  if (!chunks.length) return null;

  const bullets = chunks
    .slice(0, 5)
    .map((chunk) => {
      const summary = findOneLineSummary(chunk);
      return `- ${chunk.sourceName}${summary ? `: ${summary}` : ""}`;
    })
    .join("\n");

  return [
    "Shubham's strongest project examples include:",
    "",
    bullets,
    "",
    "These are relevant because they show practical work with RAG, agents, local LLMs, retrieval, guardrails, and deployed AI tools."
  ].join("\n");
}

function searchLocalChunks(question: string, limit = 4) {
  const queryTokens = tokenize(question);
  if (!queryTokens.length) return [];
  const wantsProjects = isProjectQuestion(question);

  return buildProfileChunks()
    .map((chunk) => {
      const contentTokens = new Set(tokenize(chunk.content));
      const overlap = queryTokens.filter((token) => contentTokens.has(token));
      const titleBoost =
        chunk.sourceType !== "resume" &&
        queryTokens.some((token) => chunk.sourceName.toLowerCase().includes(token))
        ? 3
        : 0;
      const sectionBoost = queryTokens.some((token) =>
        chunk.metadata.sectionTitle.toLowerCase().includes(token)
      )
        ? 2
        : 0;
      const boilerplatePenalty = /questions this note can answer/i.test(
        chunk.metadata.sectionTitle
      )
        ? 4
        : 0;
      const projectNoteBias =
        chunk.sourceType === "project-note" ? (wantsProjects ? 4 : 0.5) : 0;
      const resumeProjectPenalty =
        wantsProjects &&
        chunk.sourceType === "resume" &&
        /^(shubham shah|projects)$/i.test(String(chunk.metadata.sectionTitle))
          ? 2
          : 0;
      const knownProjectBoost =
        wantsProjects &&
        KNOWN_PROJECT_NAMES.some((projectName) =>
          chunk.sourceName.toLowerCase().includes(projectName.toLowerCase())
        )
          ? 1.5
          : 0;

      return {
        chunk,
        score:
          overlap.length +
          titleBoost +
          sectionBoost +
          projectNoteBias -
          boilerplatePenalty -
          resumeProjectPenalty +
          knownProjectBoost
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function localKeywordAnswer(question: string): ProfileAnswer {
  const chunkMatches = searchLocalChunks(question);

  if (!chunkMatches.length) {
    const sourceMatches = searchProfileSources(question);
    if (sourceMatches.length) {
      return {
        answer:
          "I found broad matches in Shubham's profile sources:\n\n" +
          sourceMatches
            .map((match, index) => `${index + 1}. ${match.title}: ${match.excerpt}`)
            .join("\n\n"),
        citations: sourceMatches.map((match) => match.relativePath),
        grounded: true,
        retrievalMode: "local-keyword"
      };
    }

    return {
      answer: REFUSAL,
      citations: [],
      grounded: false,
      retrievalMode: "local-keyword"
    };
  }

  const documentMatches = chunkMatches.map((match) => ({
    chunk: match.chunk as DocumentChunk,
    score: match.score
  }));
  const projectAnswer = isProjectQuestion(question)
    ? formatProjectAnswer(documentMatches)
    : null;

  if (projectAnswer) {
    return {
      answer: projectAnswer,
      citations: Array.from(new Set(documentMatches.map((match) => match.chunk.sourcePath))),
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  const sourceSummary = chunkMatches
    .map((match, index) => {
      const chunk = match.chunk as DocumentChunk;
      return `${index + 1}. ${chunk.sourceName} / ${chunk.metadata.sectionTitle}:\n${excerpt(chunk.content)}`;
    })
    .join("\n\n");

  return {
    answer:
      "Based on Shubham's resume and project notes, these are the most relevant matches:\n\n" +
      sourceSummary,
    citations: Array.from(
      new Set(chunkMatches.map((match) => match.chunk.sourcePath))
    ),
    grounded: true,
    retrievalMode: "local-keyword"
  };
}

function isBoilerplateSection(sectionTitle: unknown) {
  return /^(questions this note can answer|extra details to add later)$/i.test(
    String(sectionTitle ?? "").trim()
  );
}

export async function answerProfileQuestion(
  question: string,
  options: { sessionId?: number } = {}
): Promise<ProfileAnswer> {
  const startedAt = Date.now();

  if (!hasOpenAIConfig() || !hasSupabaseConfig()) {
    const fallback = localKeywordAnswer(question);
    await tryLogConversation({
      channel: "chat",
      sessionId: options.sessionId,
      userMessage: question,
      assistantMessage: fallback.answer,
      retrievedDocumentIds: [],
      grounded: fallback.grounded,
      latencyMs: Date.now() - startedAt
    });
    return fallback;
  }

  try {
    const [queryEmbedding] = await embedTexts([question]);
    const rawDocuments = await matchDocuments(queryEmbedding, {
      matchCount: 14,
      threshold: 0.12
    });
    const filteredDocuments = rawDocuments.filter(
      (document) => !isBoilerplateSection(document.metadata?.sectionTitle)
    );
    const documents = (filteredDocuments.length ? filteredDocuments : rawDocuments).slice(
      0,
      10
    );

    if (!documents.length) {
      const answer =
        "I do not have that information in the indexed resume or project notes.";
      await tryLogConversation({
        channel: "chat",
        sessionId: options.sessionId,
        userMessage: question,
        assistantMessage: answer,
        retrievedDocumentIds: [],
        grounded: false,
        latencyMs: Date.now() - startedAt
      });

      return {
        answer,
        citations: [],
        grounded: false,
        retrievalMode: "supabase-vector"
      };
    }

    const answer = await generateGroundedAnswer(question, documents);
    const grounded = !isModelRefusal(answer);
    const citations = grounded
      ? Array.from(new Set(documents.map((document) => document.source_path)))
      : [];

    await tryLogConversation({
      channel: "chat",
      sessionId: options.sessionId,
      userMessage: question,
      assistantMessage: answer,
      retrievedDocumentIds: documents.map((document) => document.id),
      grounded,
      latencyMs: Date.now() - startedAt
    });

    return {
      answer,
      citations,
      grounded,
      retrievalMode: "supabase-vector"
    };
  } catch (error) {
    console.warn("Supabase vector RAG failed. Falling back locally.", error);
    return localKeywordAnswer(question);
  }
}
