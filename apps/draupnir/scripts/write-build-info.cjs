// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: 0BSD

// Cross-platform replacement for the old mv/rm shell one-liners (Windows cmd.exe has neither).
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const targets = {
  version: {
    command: "git describe",
    file: path.join(__dirname, "..", "version.txt"),
  },
  branch: {
    command: "git rev-parse --abbrev-ref HEAD",
    file: path.join(__dirname, "..", "branch.txt"),
  },
};

function writeBuildInfo(target) {
  const { command, file } = targets[target];
  try {
    const output = execSync(command, { encoding: "utf-8" }).trim();
    fs.writeFileSync(file, output + "\n");
  } catch {
    // git may be unavailable, this may not be a repo, or there may be no tags/HEAD.
    // config.ts already falls back to package.json's version / a default message.
  }
}

const target = process.argv[2];
if (!targets[target]) {
  console.error(
    `Usage: node write-build-info.cjs <${Object.keys(targets).join("|")}>`
  );
  process.exit(1);
}
writeBuildInfo(target);
