const TITLE_MAX_LENGTH = 44;

const PROJECT_TITLE_RULES: Array<{ pattern: RegExp; title: string }> = [
  {
    pattern: /\b(pdf[-\s]?grounded|pdf chatbot|stair[-\s]?digital)\b/i,
    title: "PDF Grounded Chatbot"
  },
  {
    pattern:
      /\b(comment\s*ai|commentai|anti[-\s]?spam|auto[-\s]?comment|social presence|instagram\s+and\s+linkedin|linkedin\s+and\s+instagram)\b/i,
    title: "CommentAI"
  },
  {
    pattern: /\b(ccpa|privacy act|compliance reasoning|legal reasoning)\b/i,
    title: "CCPA Compliance System"
  },
  {
    pattern: /\b(civic[-\s]?path|civic path)\b/i,
    title: "Civic Path"
  },
  {
    pattern: /\b(bits[-\s]?sga|student government|sga)\b/i,
    title: "BITS SGA"
  },
  {
    pattern: /\b(gen[-\s]?ai persona|persona project)\b/i,
    title: "Gen AI Persona"
  },
  {
    pattern: /\b(scalerite)\b/i,
    title: "Scalerite"
  },
  {
    pattern: /\b(cli agent|command[-\s]?line agent)\b/i,
    title: "CLI Agent"
  },
  {
    pattern: /\b(voice agent|wizard|vapi|twilio|cal\.com|calendar booking)\b/i,
    title: "Wizard Voice Agent"
  }
];

const TOPIC_TITLE_RULES: Array<{ pattern: RegExp; title: string }> = [
  {
    pattern: /\b(schedule|book|interview|meeting|calendar|availability|slot|call)\b/i,
    title: "Schedule interview"
  },
  {
    pattern: /\b(projects?|built|build|portfolio|github repos?|repositories|repo)\b/i,
    title: "Projects overview"
  },
  {
    pattern: /\b(good fit|fit for|role|hire|hiring|candidate|position)\b/i,
    title: "Role fit"
  },
  {
    pattern: /\b(skills?|tech stack|technologies|languages|frameworks|tools)\b/i,
    title: "Skills and tech stack"
  },
  {
    pattern: /\b(experience|background|summary|profile|about shubham|who is shubham)\b/i,
    title: "Shubham's background"
  },
  {
    pattern:
      /\b(education|college|scaler school|sst|degree|university|study|studying|grades?|c?gpa)\b/i,
    title: "Education"
  },
  {
    pattern: /\b(contact|email|phone|linkedin|github|resume|cv)\b/i,
    title: "Contact and links"
  },
  {
    pattern: /\b(rag|retrieval|vector|embedding|grounded|hallucination)\b/i,
    title: "RAG and grounding"
  }
];

function cleanTitleText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
}

function truncateTitle(title: string) {
  if (title.length <= TITLE_MAX_LENGTH) return title;
  return `${title.slice(0, TITLE_MAX_LENGTH - 3).trim()}...`;
}

function normalizeKnownTerms(title: string) {
  return title
    .replace(/\bai\b/gi, "AI")
    .replace(/\bml\b/gi, "ML")
    .replace(/\brag\b/gi, "RAG")
    .replace(/\bllm\b/gi, "LLM")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bpdf\b/gi, "PDF")
    .replace(/\bccpa\b/gi, "CCPA")
    .replace(/\bvapi\b/gi, "Vapi")
    .replace(/\bcal\.com\b/gi, "Cal.com")
    .replace(/\bgithub\b/gi, "GitHub")
    .replace(/\blinkedin\b/gi, "LinkedIn");
}

function fallbackTitleFromMessage(message: string) {
  const cleaned = cleanTitleText(message)
    .replace(/^(hi|hello|hey)\b[,\s]*/i, "")
    .replace(/^(can|could|would)\s+you\s+/i, "")
    .replace(/^(please|pls)\s+/i, "")
    .replace(/^(tell me|show me|give me|explain)\s+(about\s+)?/i, "")
    .replace(/^(what|why|how|who|when|where)\s+(is|are|was|were|does|do|did|has|have)\s+/i, "")
    .trim();

  if (!cleaned) return "New chat";
  const sentenceCase = `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
  return truncateTitle(normalizeKnownTerms(sentenceCase));
}

export function titleFromUserMessage(message: string) {
  const cleaned = cleanTitleText(message);
  if (!cleaned) return "New chat";

  const projectMatch = PROJECT_TITLE_RULES.find((rule) =>
    rule.pattern.test(cleaned)
  );
  if (projectMatch) return projectMatch.title;

  const topicMatch = TOPIC_TITLE_RULES.find((rule) =>
    rule.pattern.test(cleaned)
  );
  if (topicMatch) return topicMatch.title;

  return fallbackTitleFromMessage(cleaned);
}

function titleFromAssistantAnswer(answer: string) {
  const cleaned = cleanTitleText(String(answer ?? ""));
  if (!cleaned) return "New chat";

  const topicMatch = [...PROJECT_TITLE_RULES, ...TOPIC_TITLE_RULES].find(
    (rule) => rule.pattern.test(cleaned)
  );
  if (topicMatch) return topicMatch.title;

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/).at(0) ?? cleaned;
  return truncateTitle(normalizeKnownTerms(firstSentence));
}

export function titleFromConversation(userMessage: string, answer: string) {
  const userTitle = titleFromUserMessage(userMessage);
  if (userTitle !== "New chat") return userTitle;
  return titleFromAssistantAnswer(answer);
}
