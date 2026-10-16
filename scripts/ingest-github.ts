import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { fetchLanguages, fetchReadme, listOwnerRepos } from "../lib/github/client";
import { cleanReadme } from "../lib/github/readme";
import {
  renderSnapshot,
  skipReason,
  snapshotFileName,
  type CuratedNote
} from "../lib/github/snapshot";

const EXCLUDE = ["Shubham-Doppelganger", "Shubhamm-02", "skills-introduction-to-github"];
const INCLUDE: string[] = [];
const CREATED_AFTER = "2026-06-06";
const DEFAULT_OWNER = "Shubhamm-02";
const NOTES_DIR = "data/project-notes";
const SNAPSHOT_DIR = "data/github";

loadEnvConfig(process.cwd());

function markdownFiles(directory: string) {
  const absolute = path.join(process.cwd(), directory);
  return existsSync(absolute)
    ? readdirSync(absolute).filter((fileName) => fileName.endsWith(".md")).sort()
    : [];
}

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function loadCuratedNotes(): CuratedNote[] {
  return markdownFiles(NOTES_DIR).map((fileName) => {
    const notePath = `${NOTES_DIR}/${fileName}`;
    return { path: notePath, content: readRepoFile(notePath) };
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const owner = process.env.GITHUB_OWNER?.trim() || DEFAULT_OWNER;
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  const rules = {
    exclude: EXCLUDE,
    include: INCLUDE,
    createdAfter: CREATED_AFTER,
    notes: loadCuratedNotes()
  };

  const repos = (await listOwnerRepos(owner, token)).sort((a, b) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
  );
  console.info(`${repos.length} public repos for ${owner}${token ? "" : " (unauthenticated)"}\n`);

  const snapshots = new Map<string, string>();
  for (const repo of repos) {
    const reason = skipReason(repo, rules);
    if (reason) {
      console.info(`skip   ${repo.name}: ${reason}`);
      continue;
    }

    const readmeSource = await fetchReadme(repo, token);
    const readme = readmeSource ? cleanReadme(readmeSource) : "";
    if (!readme) {
      console.info(`skip   ${repo.name}: no README`);
      continue;
    }

    const fileName = snapshotFileName(repo.name);
    if (snapshots.has(fileName)) {
      throw new Error(`Two repos map to ${SNAPSHOT_DIR}/${fileName}; add one of them to EXCLUDE.`);
    }

    const languages = await fetchLanguages(repo, token);
    snapshots.set(fileName, renderSnapshot({ repo, languages, readme }));
    console.info(`index  ${repo.name} -> ${SNAPSHOT_DIR}/${fileName}`);
  }

  const existing = markdownFiles(SNAPSHOT_DIR);
  const stale = existing.filter((fileName) => !snapshots.has(fileName));
  const changed = [...snapshots].filter(
    ([fileName, content]) =>
      !existing.includes(fileName) || readRepoFile(`${SNAPSHOT_DIR}/${fileName}`) !== content
  );

  console.info(
    `\n${snapshots.size} snapshots: ${changed.length} new or changed, ${stale.length} to delete.`
  );
  for (const fileName of stale) console.info(`delete ${SNAPSHOT_DIR}/${fileName}`);

  if (dryRun) {
    console.info("Dry run: nothing written.");
    return;
  }

  mkdirSync(path.join(process.cwd(), SNAPSHOT_DIR), { recursive: true });
  for (const [fileName, content] of changed) {
    writeFileSync(path.join(process.cwd(), SNAPSHOT_DIR, fileName), content);
  }
  for (const fileName of stale) {
    rmSync(path.join(process.cwd(), SNAPSHOT_DIR, fileName));
  }
  console.info("Done. Run `npm run ingest:resume` to index the snapshots.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
