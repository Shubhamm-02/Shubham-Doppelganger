import { findKnownCallerName } from "@/lib/scheduling-names";

const DEFAULT_HOST_EMAILS = ["shubhamshah473@gmail.com", "shubhammmm51@gmail.com"];
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const FULL_EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const GMAIL_LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?$/;
const SPOKEN_EMAIL_PATTERN =
  /\b[a-z0-9]+(?:\s+(?:dot|underscore)\s+[a-z0-9]+)*\s+(?:at the rate(?: of)?|at)\s+[a-z0-9]+(?:\s+dot\s+[a-z0-9]+)+\b/gi;
const NAME_INTRO_PATTERN = /\b(?:my name is|my name['’]s|name is|name\s*[:-]|call me)\s+(.+)/i;
const SELF_INTRO_PATTERN = /\b(?:[Ii] am|[Ii]['’]?m|[Tt]his is)\s+([A-Z].*)/;
const NAME_WORD_PATTERN = /^[a-z][a-z.'-]*$/i;
const CONTRACTION_PATTERN = /['’](?:s|re|ll|ve|d|m|t)$/i;
const NON_NAME_WORDS = new Set(
  `a about actually afternoon again ahead alright also am an and another any are as at availability
  available be best book booked booking busy but by calendar call can cancel cc change chat check
  cheers choose company confirm confirmed contact could cool correct date day days dec december did
  do does done drop email evening feb february fine first for fri friday from gmail gmt go good got
  great had has have he hello her here hey hi him his hiring hm hmm hold how i im in interested
  interview invite is ist it its jul july just last later let lets like looking mail mar march may
  maybe me meet meeting mind mine mon monday morning my name need never next nice night no noon nope
  not nov november now oct october of oh ok okay on one option options or other our perfect please
  pls pm prefer reach received recruiter regards right sat saturday schedule second send sending
  sent sep sept september set setup she should slot slots so sorry soon sounds speak stop sun
  sunday sure take talk thank thanks that the their them then there these they this those three
  thu thur thurs thursday thx time timezone to today tomorrow tmrw tue tues tuesday two ty uh um up
  us use using utc via wait want was we wed weds wednesday week weekend well what when where which
  who why will with works would yeah yep yes you your yup`.split(/\s+/)
);

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeEmailCandidate(value: string) {
  let candidate = normalizedEmail(value);
  if (!candidate.includes("@")) {
    candidate = candidate
      .replace(/\bat the rate(?: of)?\b/g, "@")
      .replace(/\bat\b/g, "@")
      .replace(/\bdot\b/g, ".")
      .replace(/\bunderscore\b/g, "_");
  }
  candidate = candidate.replace(/\s+/g, "").replace(/^[<("']+|[>)"'.,;:!?]+$/g, "");
  if (candidate.endsWith("@gmail")) candidate = `${candidate}.com`;

  if (FULL_EMAIL_PATTERN.test(candidate)) return candidate;
  if (GMAIL_LOCAL_PART_PATTERN.test(candidate)) return `${candidate}@gmail.com`;
  return "";
}

function findEmails(text: string) {
  const written = [...text.matchAll(EMAIL_PATTERN)].map((match) => ({
    index: match.index,
    email: normalizedEmail(match[0])
  }));
  const spoken = [...text.matchAll(SPOKEN_EMAIL_PATTERN)].map((match) => ({
    index: match.index,
    email: normalizeEmailCandidate(match[0])
  }));

  return [...written, ...spoken]
    .filter((found) => FULL_EMAIL_PATTERN.test(found.email))
    .sort((first, second) => first.index - second.index);
}

export function extractLatestEmail(text: string) {
  return findEmails(text).at(-1)?.email ?? null;
}

function isNameWord(word: string) {
  return (
    NAME_WORD_PATTERN.test(word) &&
    !CONTRACTION_PATTERN.test(word) &&
    !NON_NAME_WORDS.has(word.toLowerCase())
  );
}

function leadingName(fragment: string) {
  const words: string[] = [];
  for (const token of fragment.trim().split(/\s+/)) {
    const word = token.replace(/[,.;:!?]+$/, "");
    if (!isNameWord(word) || words.length === 4) break;
    words.push(word);
    if (word !== token) break;
  }
  return words.join(" ");
}

function trailingName(fragment: string) {
  const tokens = fragment.trim().split(/\s+/);
  const words: string[] = [];
  for (let index = tokens.length - 1; index >= 0 && words.length < 4; index -= 1) {
    const word = tokens[index].replace(/[,.;:!?]+$/, "");
    if (!isNameWord(word) || (index < tokens.length - 1 && word !== tokens[index])) break;
    words.unshift(word);
  }
  return words.join(" ");
}

function standaloneName(line: string) {
  const words = line
    .replace(/[,.;:!?]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 1 && words.length <= 4 && words.every(isNameWord) && words[0].length > 1
    ? words.join(" ")
    : "";
}

function findName(text: string) {
  const intro = text.match(NAME_INTRO_PATTERN)?.[1] ?? text.match(SELF_INTRO_PATTERN)?.[1];
  const introName = intro ? leadingName(intro) : "";
  if (introName) return introName;

  const email = findEmails(text).at(-1);
  if (email) {
    const lineBeforeEmail = text.slice(0, email.index).split(/\n/).at(-1) ?? "";
    const nameBeforeEmail = trailingName(lineBeforeEmail);
    if (nameBeforeEmail) return nameBeforeEmail;
  }

  const lines = text
    .replace(EMAIL_PATTERN, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.map(findKnownCallerName).find(Boolean) ??
    lines.map(standaloneName).find(Boolean) ??
    ""
  );
}

export function extractName(text: string) {
  const name = findName(text);
  return name ? findKnownCallerName(name) ?? name : null;
}

function hostEmails() {
  const configured = [process.env.CAL_HOST_EMAILS, process.env.CAL_HOST_EMAIL]
    .filter(Boolean)
    .join(",");
  const emails = configured
    ? configured.split(",").map(normalizedEmail).filter(Boolean)
    : DEFAULT_HOST_EMAILS;
  return new Set(emails);
}

export function isHostEmail(email: string | null | undefined) {
  return Boolean(email && hostEmails().has(normalizedEmail(email)));
}
