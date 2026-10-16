const SHUBHAM_NAME_MISHEARS =
  /\b(?:shivam|shivaam|shibham|shubim|shubimshah|shubim shah|shubhamshah|shubam|subham|chibham|chubham|chebo|shoobham|schubham)(?:'s)?\b/gi;

export function normalizeProfileQuestion(question: string) {
  return question.replace(SHUBHAM_NAME_MISHEARS, (match) =>
    match.toLowerCase().endsWith("'s") ? "Shubham's" : "Shubham"
  );
}

export function isProjectQuestion(question: string) {
  return /\b(project|projects|built|github|portfolio|repo|repos)\b/i.test(question);
}

const RECENCY =
  /\b(?:recent(?:ly)?|latest|lately|newest|nowadays|these days|right now|currently|this (?:month|year))\b/i;
const WORK =
  /\b(?:work|projects?|repos?|repositories|github|built|build(?:ing)?|shipped|made|making|up to)\b/i;

export function isRecentWorkQuestion(question: string) {
  return /\bworking on\b/i.test(question) || (RECENCY.test(question) && WORK.test(question));
}

export function isGradeQuestion(question: string) {
  return /\b(?:cgpa|gpa|cgr|grades?|grade point)\b/i.test(question);
}

export function isProjectListQuestion(question: string) {
  return (
    /\b(projects|repos|repositories|portfolio)\b/i.test(question) &&
    !/\b(which|how|why|uses?|using|tradeoffs?|architecture|stack|compare|difference)\b/i.test(
      question
    )
  );
}

export function isWizardProjectQuestion(question: string) {
  return /\b(this project|current project|wizard|doppelganger|doppleganger|ai representative|voice agent|voice assistant|chat interface|vapi|twilio|cal\.?com|scaler assessment|screening assignment)\b/i.test(
    question
  );
}

export function isProfileOverviewQuestion(question: string) {
  const normalized = normalizeProfileQuestion(question).toLowerCase();
  return (
    /\b(tell me about|brief|overview|summary|summarize|introduce|introduction|profile|background|who is|who's|describe)\b/.test(
      normalized
    ) && /\b(shubham|him|he|candidate|person|profile)\b/.test(normalized)
  );
}
