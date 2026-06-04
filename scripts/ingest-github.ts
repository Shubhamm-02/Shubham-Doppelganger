import { buildProfileChunks } from "../lib/chunking";

const projectChunks = buildProfileChunks().filter(
  (chunk) => chunk.sourceType === "project-note"
);
const projectPaths = new Set(projectChunks.map((chunk) => chunk.sourcePath));

console.log("Current GitHub/project-note inventory");
for (const sourcePath of projectPaths) {
  const count = projectChunks.filter(
    (chunk) => chunk.sourcePath === sourcePath
  ).length;
  console.log(`- ${sourcePath}: ${count} chunks`);
}

console.log(
  "\nFor Day 2, curated project notes are the source of truth. Direct GitHub API ingestion can be added later if you want live repo refreshes."
);
