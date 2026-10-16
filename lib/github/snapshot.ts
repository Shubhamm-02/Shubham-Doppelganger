import type { GitHubRepo } from "@/lib/github/client";

export type CuratedNote = { path: string; content: string };

export type SkipRules = {
  exclude: string[];
  include: string[];
  createdAfter: string;
  notes: CuratedNote[];
};

export type RepoSnapshot = {
  repo: GitHubRepo;
  languages: Record<string, number>;
  readme: string;
};

const MIN_DESCRIPTION_WORDS = 6;

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function containsRun(haystack: string[], needle: string[]) {
  return (
    needle.length > 0 &&
    haystack.some((_, start) =>
      needle.every((word, offset) => haystack[start + offset] === word)
    )
  );
}

function linkedRepos(content: string) {
  return Array.from(
    content.matchAll(/GitHub:\**\s*<?https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)/gi),
    (match) => match[1].replace(/\.git$|\.+$/, "").toLowerCase()
  );
}

function noteSlug(notePath: string) {
  return notePath.split("/").pop()?.replace(/\.md$/i, "") ?? notePath;
}

// A note covers a repo when it links it, is named after it, or quotes the repo's description.
function coveringNote(repo: GitHubRepo, notes: CuratedNote[]) {
  const repoWords = words(repo.name);
  const descriptionWords = words(repo.description ?? "");
  const description = descriptionWords.join(" ");

  return notes.find(
    (note) =>
      linkedRepos(note.content).includes(repo.fullName.toLowerCase()) ||
      containsRun(repoWords, words(noteSlug(note.path))) ||
      (descriptionWords.length >= MIN_DESCRIPTION_WORDS &&
        ` ${words(note.content).join(" ")} `.includes(` ${description} `))
  );
}

function listed(names: string[], name: string) {
  return names.some((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

export function skipReason(repo: GitHubRepo, rules: SkipRules) {
  if (listed(rules.exclude, repo.name)) return "excluded";
  if (listed(rules.include, repo.name)) return null;
  if (repo.fork) return "fork";
  if (repo.archived) return "archived";
  if (repo.createdAt.slice(0, 10) <= rules.createdAfter) {
    return `created before ${rules.createdAfter}`;
  }

  const note = coveringNote(repo, rules.notes);
  return note ? `covered by ${note.path}` : null;
}

export function snapshotFileName(repoName: string) {
  const slug = repoName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.md`;
}

function listOrNone(values: string[]) {
  return values.length ? values.join(", ") : "None";
}

export function renderSnapshot({ repo, languages, readme }: RepoSnapshot) {
  const languageNames = Object.entries(languages)
    .sort(([nameA, bytesA], [nameB, bytesB]) => bytesB - bytesA || (nameA < nameB ? -1 : 1))
    .map(([name]) => name);
  const topics = [...repo.topics].sort();
  const description = repo.description?.replace(/\s+/g, " ").trim();

  return [
    `# ${repo.name}`,
    "",
    `- GitHub: ${repo.htmlUrl}`,
    `- Created: ${repo.createdAt.slice(0, 10)}`,
    `- Last pushed: ${repo.pushedAt.slice(0, 10)}`,
    `- Languages: ${listOrNone(languageNames)}`,
    `- Topics: ${listOrNone(topics)}`,
    `- Description: ${description || "None"}`,
    "",
    "## README",
    "",
    readme,
    ""
  ].join("\n");
}
