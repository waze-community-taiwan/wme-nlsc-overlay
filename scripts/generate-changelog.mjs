#!/usr/bin/env node
// Generate release notes + prepend to CHANGELOG.md.
//
// Usage:
//   node scripts/generate-changelog.mjs <version> <tag> <repo> <event>
//
// Where:
//   version  e.g. "0.2.0"
//   tag      e.g. "v0.2.0"
//   repo     e.g. "waze-community-taiwan/wme-nlsc-overlay"
//   event    "push" (tag pushed) or "workflow_dispatch" (auto-bump path)
//
// Side effects:
//   - Writes RELEASE_NOTES.md (used by `gh release create --notes-file`).
//   - Updates CHANGELOG.md with a new entry for this release at the top.
//
// Commit grouping follows Conventional Commits
// (https://www.conventionalcommits.org/). Anything that doesn't match falls
// into "Other" so nothing is silently dropped.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [, , version, tag, repo, event] = process.argv;
if (!version || !tag || !repo || !event) {
  console.error(
    "usage: generate-changelog.mjs <version> <tag> <repo> <event>",
  );
  process.exit(2);
}

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

// Find the previous release tag.
//
// On a tag-push, the current tag is the one being released so we look one
// step back in history from that tag. Otherwise we look back from HEAD.
//
// We use `git describe --tags --abbrev=0`, which walks the commit graph to
// find the closest reachable tag. This is what we want for changelog
// purposes: it yields the last *actually released* version, not the highest
// semver tag (which can be an orphan tag pointing at an unrelated commit).
const allTags = sh("git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname")
  .split("\n")
  .filter(Boolean);

let prevTag = "";
let rangeEnd = "HEAD";
if (event === "push") {
  rangeEnd = tag;
  try {
    prevTag = sh(`git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' ${tag}^`);
  } catch {
    prevTag = "";
  }
} else {
  try {
    prevTag = sh(`git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD`);
  } catch {
    prevTag = allTags[0] ?? "";
  }
}

const range = prevTag ? `${prevTag}..${rangeEnd}` : rangeEnd;
console.log(`Changelog range: ${range} (previous tag: ${prevTag || "<none>"})`);

// %x1f is the unit-separator byte; safer than tabs because some commit
// subjects could contain tabs.
const raw = sh(
  `git log --no-merges --pretty=format:'%H%x1f%s' ${range} -- . ':(exclude)dist/' || true`,
);
const commits = raw
  ? raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, subject] = line.split("\x1f");
        return { hash, short: hash.slice(0, 7), subject };
      })
  : [];

const SECTIONS = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactors"],
  ["docs", "Documentation"],
  ["build", "Build"],
  ["ci", "CI"],
  ["test", "Tests"],
  ["chore", "Chores"],
];

const buckets = Object.fromEntries(SECTIONS.map(([k]) => [k, []]));
const breaking = [];
const other = [];

// `feat:`, `feat(scope):`, `feat!:`, `feat(scope)!:` all match.
const ccRe = /^([a-z]+)(\([^)]+\))?(!?):\s*(.+)$/;

for (const c of commits) {
  const link = `[\`${c.short}\`](https://github.com/${repo}/commit/${c.hash})`;
  const m = ccRe.exec(c.subject);
  if (!m) {
    other.push(`- ${escapeMd(c.subject)} (${link})`);
    continue;
  }
  const [, type, scope, bang, body] = m;
  const scopePrefix = scope ? `**${scope.slice(1, -1)}:** ` : "";
  const item = `- ${scopePrefix}${escapeMd(body)} (${link})`;
  if (bang === "!") breaking.push(item);
  if (buckets[type]) {
    buckets[type].push(item);
  } else if (bang !== "!") {
    other.push(`- ${escapeMd(c.subject)} (${link})`);
  }
}

const date = new Date().toISOString().slice(0, 10);
const heading = `## [${version}](https://github.com/${repo}/releases/tag/${tag}) — ${date}`;
const compareLink = prevTag
  ? `[Compare \`${prevTag}...${tag}\`](https://github.com/${repo}/compare/${prevTag}...${tag})`
  : "_Initial tracked release._";

let body = `${heading}\n\n${compareLink}\n\n`;

if (breaking.length) {
  body += `### Breaking Changes\n\n${breaking.join("\n")}\n\n`;
}
for (const [key, label] of SECTIONS) {
  if (buckets[key].length) {
    body += `### ${label}\n\n${buckets[key].join("\n")}\n\n`;
  }
}
if (other.length) {
  body += `### Other\n\n${other.join("\n")}\n\n`;
}
if (commits.length === 0) {
  body += `_No user-facing commits since the previous release._\n\n`;
}

body +=
  `**Install:** [\`wme-nlsc-overlay.user.js\`]` +
  `(https://github.com/${repo}/releases/download/${tag}/wme-nlsc-overlay.user.js)` +
  ` — open with Tampermonkey/Violentmonkey/Greasemonkey to install.\n` +
  `Always-latest link: [\`releases/latest/download/wme-nlsc-overlay.user.js\`]` +
  `(https://github.com/${repo}/releases/latest/download/wme-nlsc-overlay.user.js).\n`;

writeFileSync("RELEASE_NOTES.md", body);
console.log("Wrote RELEASE_NOTES.md");
console.log("----- begin RELEASE_NOTES.md -----");
console.log(body);
console.log("----- end RELEASE_NOTES.md -------");

// Prepend to CHANGELOG.md (creating it if absent).
const HEADER = `# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

let existing = "";
if (existsSync("CHANGELOG.md")) {
  existing = readFileSync("CHANGELOG.md", "utf8");
}

let existingEntries = "";
if (existing) {
  const firstEntry = existing.search(/^## /m);
  existingEntries = firstEntry === -1 ? "" : existing.slice(firstEntry);
}

const next = HEADER + body + existingEntries;
writeFileSync("CHANGELOG.md", next);
console.log("Updated CHANGELOG.md");

function escapeMd(s) {
  // Conservative: only escape `<` so `<wmts:Layer>` style subjects don't get
  // misread as HTML by some renderers. Backticks/etc. are intentionally left
  // alone because they're often meaningful in commit subjects.
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
