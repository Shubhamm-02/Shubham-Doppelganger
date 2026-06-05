import { buildProfileChunks, type DocumentChunk } from "@/lib/chunking";
import {
  embedTexts,
  generateGroundedAnswer,
  generateGroundedVoiceAnswer,
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
  "I do not have that detail in Shubham's verified profile yet.";

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
  "PDF-Grounded Chatbot",
  "CommentAI",
  "CCPA Compliance Reasoning System",
  "CLI Agent"
];

const SHUBHAM_NAME_MISHEARS =
  /\b(?:shivam|shivaam|shibham|shubim|shubimshah|shubim shah|shubhamshah|shoobham|schubham)(?:'s)?\b/gi;

function normalizeProfileQuestion(question: string) {
  return question.replace(SHUBHAM_NAME_MISHEARS, (match) =>
    match.toLowerCase().endsWith("'s") ? "Shubham's" : "Shubham"
  );
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
        !line.startsWith("Source:") &&
        !line.startsWith("Source path:") &&
        !line.startsWith("Section:") &&
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

function isProjectNoteChunk(chunk: DocumentChunk) {
  return chunk.sourcePath.startsWith("data/project-notes/");
}

function projectChunkRank(chunk: DocumentChunk) {
  const section = String(chunk.metadata.sectionTitle ?? "");
  let rank = 0;
  if (/one-line summary/i.test(chunk.content)) rank += 8;
  if (/^(one-line summary|why this project matters|purpose|what it does|features)$/i.test(section)) {
    rank += 4;
  }
  if (/^(source|setup|run|test|questions this note can answer|extra details to add later)$/i.test(section)) {
    rank -= 3;
  }
  return rank;
}

function formatProjectAnswer(matches: Array<{ chunk: DocumentChunk; score: number }>) {
  const byProject = new Map<string, DocumentChunk>();

  for (const match of matches) {
    const chunk = match.chunk;
    if (chunk.sourceType !== "project-note" || !isProjectNoteChunk(chunk)) continue;
    const existing = byProject.get(chunk.sourceName);
    if (!existing || projectChunkRank(chunk) > projectChunkRank(existing)) {
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
  const normalizedQuestion = normalizeProfileQuestion(question);
  const queryTokens = expandQueryTokens(tokenize(normalizedQuestion));
  if (!queryTokens.length) return [];
  const wantsProjects = isProjectQuestion(normalizedQuestion);

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
  const normalizedQuestion = normalizeProfileQuestion(question);
  const chunkMatches = searchLocalChunks(
    normalizedQuestion,
    isProjectQuestion(normalizedQuestion) ? 300 : 4
  );

  if (!chunkMatches.length) {
    const sourceMatches = searchProfileSources(normalizedQuestion);
    if (sourceMatches.length) {
      return {
        answer:
          "I found relevant verified profile details:\n\n" +
          sourceMatches
            .map((match, index) => `${index + 1}. ${match.excerpt}`)
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
  const projectAnswer = isProjectQuestion(normalizedQuestion)
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
      return `${index + 1}. ${chunk.metadata.sectionTitle}:\n${excerpt(chunk.content)}`;
    })
    .join("\n\n");

  return {
    answer:
      "Based on Shubham's verified profile, these are the most relevant details:\n\n" +
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

function toRetrievedDocuments(
  matches: Array<{ chunk: DocumentChunk; score: number }>
) {
  return matches.map(({ chunk, score }, index) => ({
    id: index + 1,
    source_type: chunk.sourceType,
    source_name: chunk.sourceName,
    source_path: chunk.sourcePath,
    source_url: chunk.sourceUrl,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    metadata: chunk.metadata,
    similarity: Math.min(0.99, Math.max(0.01, score / 10))
  }));
}

export async function answerVoiceProfileQuestion(
  question: string
): Promise<ProfileAnswer> {
  const normalizedQuestion = normalizeProfileQuestion(question);
  const chunkMatches = searchLocalChunks(
    normalizedQuestion,
    isProjectQuestion(normalizedQuestion) ? 300 : 5
  );

  if (!chunkMatches.length) {
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
  const projectAnswer = isProjectQuestion(normalizedQuestion)
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

  if (hasOpenAIConfig()) {
    try {
      const documents = toRetrievedDocuments(documentMatches);
      const answer = await generateGroundedVoiceAnswer(normalizedQuestion, documents);
      return {
        answer,
        citations: Array.from(new Set(documentMatches.map((match) => match.chunk.sourcePath))),
        grounded: !isModelRefusal(answer),
        retrievalMode: "local-keyword"
      };
    } catch (error) {
      console.warn("OpenAI voice synthesis failed. Returning grounded facts.", error);
    }
  }

  const facts = documentMatches
    .slice(0, 4)
    .map(({ chunk }) => {
      const section = String(chunk.metadata.sectionTitle ?? "Profile");
      const summary = cleanMarkdown(excerpt(chunk.content)).slice(0, 260).trim();
      return `- ${section}: ${summary}`;
    })
    .join("\n");

  return {
    answer: `Use these verified profile facts to answer briefly. Do not mention file names, folders, citations, or source labels.\n${facts}`,
    citations: Array.from(new Set(documentMatches.map((match) => match.chunk.sourcePath))),
    grounded: true,
    retrievalMode: "local-keyword"
  };
}

export async function answerProfileQuestion(
  question: string,
  options: { sessionId?: number } = {}
): Promise<ProfileAnswer> {
  const startedAt = Date.now();
  const normalizedQuestion = normalizeProfileQuestion(question);

  if (!hasOpenAIConfig() || !hasSupabaseConfig()) {
    const fallback = localKeywordAnswer(normalizedQuestion);
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
    const [queryEmbedding] = await embedTexts([normalizedQuestion]);
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
        "I do not have that detail in Shubham's verified profile yet.";
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

    const answer = await generateGroundedAnswer(normalizedQuestion, documents);
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
    return localKeywordAnswer(normalizedQuestion);
  }
}
