// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * @param {Object} args
 * @param {import('@actions/github').getOctokit} args.github
 * @param {import('@actions/github').context} args.context
 */
module.exports = async ({ github, context }) => {
  const sha = context.payload.workflow_run.head_sha;

  // Get all check runs for this commit
  const checks = await github.rest.checks.listForRef({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: sha,
  });

  // Filter out the gate itself and third-party checks
  const knownWorkflows = [
    "GHCR - Development Branches",
    "Docker Hub - Release",
    "Docker Hub - Latest",
    "Docker Hub - Develop",
    "GHCR - Release",
    "Tests",
    "GHCR - Latest",
    "Contribution requirements",
  ];
  const relevantChecks = checks.data.check_runs.filter((check) =>
    knownWorkflows.includes(check.name)
  );

  // Check if ANY workflow is still running or queued
  const incompleteChecks = relevantChecks.filter(
    (check) => check.status !== "completed"
  );
  if (incompleteChecks.length > 0) {
    console.log(
      `Waiting on ${incompleteChecks.length} checks... exiting for now.`
    );
    return;
  }

  // Exclude skipped from failing the gate, treat success/neutral/skipped as OK
  const allPassed = relevantChecks.every((check) =>
    ["success", "neutral", "skipped"].includes(check.conclusion)
  );

  await github.rest.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    name: "Workflow Gate",
    head_sha: sha,
    status: "completed",
    conclusion: allPassed ? "success" : "failure",
    output: {
      title: "Workflow Status",
      summary: `${relevantChecks.length} workflow(s) evaluated: ${allPassed ? "✅ all passed" : "❌ some failed"}`,
    },
  });
};
