const API_BASE_URL = "https://api.github.com";
const RAW_BASE_URL = "https://raw.githubusercontent.com";
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15_000;

export type GitHubRepo = {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  createdAt: string;
  pushedAt: string;
  topics: string[];
};

type ApiRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  created_at: string;
  pushed_at: string;
  topics?: string[];
};

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function apiHeaders(token: string | undefined, accept: string) {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "shubham-doppelganger-ingest",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function failure(response: Response, path: string) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const resetAt = Number.isFinite(reset) && reset > 0
      ? ` until ${new Date(reset * 1000).toISOString()}`
      : "";
    return new GitHubApiError(
      response.status,
      `GitHub API rate limit reached${resetAt}. Set GITHUB_TOKEN to raise the limit.`
    );
  }
  return new GitHubApiError(response.status, `GitHub request ${path} failed with ${response.status}.`);
}

async function apiGet(path: string, token: string | undefined, accept = "application/vnd.github+json") {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: apiHeaders(token, accept),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw failure(response, path);
  return response;
}

export async function listOwnerRepos(owner: string, token?: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];

  for (let page = 1; ; page += 1) {
    const path = `/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=${PAGE_SIZE}&page=${page}`;
    const response = await apiGet(path, token);
    if (!response) throw new GitHubApiError(404, `GitHub user ${owner} was not found.`);

    const batch = (await response.json()) as ApiRepo[];
    for (const repo of batch) {
      repos.push({
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        description: repo.description,
        fork: repo.fork,
        archived: repo.archived,
        createdAt: repo.created_at,
        pushedAt: repo.pushed_at,
        topics: repo.topics ?? []
      });
    }
    if (batch.length < PAGE_SIZE) return repos;
  }
}

// raw.githubusercontent.com does not count against the API rate limit (60/hour unauthenticated);
// the API lookup only runs for READMEs with another file name or location.
export async function fetchReadme(repo: GitHubRepo, token?: string): Promise<string | null> {
  const raw = await fetch(`${RAW_BASE_URL}/${repo.fullName}/HEAD/README.md`, {
    headers: { "User-Agent": "shubham-doppelganger-ingest" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (raw.ok) return raw.text();
  if (raw.status !== 404) {
    throw new GitHubApiError(raw.status, `README download for ${repo.fullName} failed with ${raw.status}.`);
  }

  const response = await apiGet(`/repos/${repo.fullName}/readme`, token, "application/vnd.github.raw");
  return response ? response.text() : null;
}

export async function fetchLanguages(repo: GitHubRepo, token?: string): Promise<Record<string, number>> {
  const response = await apiGet(`/repos/${repo.fullName}/languages`, token);
  return response ? ((await response.json()) as Record<string, number>) : {};
}
