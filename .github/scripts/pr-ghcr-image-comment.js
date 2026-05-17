// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * @param {Object} args
 * @param {import('@actions/github').getOctokit} args.github
 * @param {import('@actions/github').context} args.context
 * @param {import('@actions/core')} args.core
 */
module.exports = async ({ github, context, core }) => {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    core.notice("No pull_request payload found; skipping.");
    return;
  }

  const marker = "<!-- ghcr-pr-image-link -->";
  const repo = context.repo.repo;
  const ownerContext = context.repo.owner;
  const prNumber = pullRequest.number;

  // prOwner is a bit confusingly named it could be argued. Its Head Branch Owner effectively.
  // It is used to determine the GHCR namespace for the PR build.
  // In most cases this will be the same as the repo owner,
  // but in fork scenarios it will be different and we want to ensure the GHCR namespace is correct,
  // to keep this workflow functional for its intended purpose of providing image refs for PRs independently of origin.
  const prOwner = pullRequest.head?.repo?.owner?.login || ownerContext;
  const branch = pullRequest.head?.ref || "";
  const sha = pullRequest.head?.sha || context.sha;
  const shortSha = sha.substring(0, 7);
  const normalizedBranch = branch.replace(/\//g, "-");

  const lowerOwner = prOwner.toLowerCase();
  const lowerRepo = repo.toLowerCase();

  const imageNamespace = `ghcr.io/${lowerOwner}/${lowerRepo}`;
  // The root package URL on GitHub. We can't link to the exact version ID without querying the GH API,
  // so we link to the package landing page where the user can see the recent tags.
  const packageUrl = `https://github.com/${prOwner}/${repo}/pkgs/container/${lowerRepo}`;

  const branchTag = normalizedBranch || shortSha;
  const shaTag = `sha-${shortSha}`;

  const body = [
    `GHCR image refs for this PR:`,
    "",
    `- Namespace: \`${imageNamespace}\``,
    `- Branch tag: \`${branchTag}\``,
    `- SHA tag: \`${shaTag}\``,
    `- Package Page: [GHCR Link](${packageUrl})`,
    `- Pull: \`docker pull ${imageNamespace}:${branchTag}\``,
    "",
    `This comment is generated from PR metadata only. It does not checkout or run PR code and is generated in a static manner`,
    marker,
  ].join("\n");

  // Update or create comments
  const comments = await github.rest.issues.listComments({
    owner: ownerContext,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existingComment = comments.data.find(
    (comment) =>
      comment.user?.type === "Bot" &&
      typeof comment.body === "string" &&
      comment.body.includes(marker)
  );

  if (existingComment) {
    await github.rest.issues.updateComment({
      owner: ownerContext,
      repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: ownerContext,
      repo,
      issue_number: prNumber,
      body,
    });
  }
};
