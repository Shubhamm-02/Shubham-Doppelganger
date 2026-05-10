const KNOWN_CALLER_NAMES = [
  "Dhruv",
  "Dhruv Davda",
  "Tauseef",
  "Tauseef Ahmad",
  "Shubham",
  "Shubham Shah",
  "Manya",
  "Manya Nayak",
  "Jils",
  "Jils Patel",
  "Mohit",
  "Mohit Kumar"
];

function normalizeName(value: string) {
  return value
    .replace(/[^a-z\s.'-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const KNOWN_CALLER_NAME_MAP = new Map(
  KNOWN_CALLER_NAMES.map((name) => [normalizeName(name), name])
);

export function findKnownCallerName(value: string) {
  const normalized = normalizeName(value);
  return KNOWN_CALLER_NAME_MAP.get(normalized);
}

export function isKnownCallerName(value: string) {
  return Boolean(findKnownCallerName(value));
}
