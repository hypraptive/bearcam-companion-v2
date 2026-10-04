#!/usr/bin/env node
/**
 * PostTaskExec hook helper for "Commit Code on Task Complete".
 *
 * Reads the hook's JSON session context from stdin, derives a commit-message
 * subject from the spec task's title, and commits all staged/working changes
 * to the current branch. Skips cleanly when:
 *   - the cwd is not a git repository, or
 *   - there is nothing to commit.
 *
 * The task title is pulled from the stdin payload (keys tried in order:
 * taskName, taskId, task.name, task.title, task.id). The leading task number
 * (e.g. "2.1 ") and surrounding markdown backticks are stripped so the commit
 * subject reads cleanly, then it is capped at 72 characters.
 */

const { execFileSync } = require("node:child_process");

function readStdin() {
  try {
    return require("node:fs").readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitQuietExitCode(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return 0;
  } catch (e) {
    return typeof e.status === "number" ? e.status : 1;
  }
}

function pick(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function deriveSubject(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  let title;
  if (payload) {
    const candidates = [
      "taskName",
      "taskId",
      "task.name",
      "task.title",
      "task.id",
      "name",
    ];
    for (const key of candidates) {
      const val = pick(payload, key);
      if (typeof val === "string" && val.trim()) {
        title = val.trim();
        break;
      }
    }
  }

  // Fall back to the raw payload text if no recognized field was found.
  if (!title) title = raw.replace(/\s+/g, " ").trim();
  if (!title) return "Complete task";

  // Strip a leading task number like "2.1 " or "15. ".
  title = title.replace(/^\d+(\.\d+)*[.)]?\s+/, "");
  // Drop markdown backticks used around code identifiers.
  title = title.replace(/`/g, "");
  // Collapse whitespace and cap length for a clean subject line.
  title = title.replace(/\s+/g, " ").trim().slice(0, 72);

  return title || "Complete task";
}

function main() {
  const raw = readStdin();

  // Not a git repo -> skip quietly.
  let branch;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    console.error("Not a git repository; skipping commit.");
    process.exit(0);
  }

  // Nothing to commit -> skip.
  const dirtyWorking = gitQuietExitCode(["diff", "--quiet"]) !== 0;
  const dirtyStaged = gitQuietExitCode(["diff", "--cached", "--quiet"]) !== 0;
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).length > 0;
  if (!dirtyWorking && !dirtyStaged && !untracked) {
    console.log(`No changes to commit on ${branch}.`);
    process.exit(0);
  }

  const subject = deriveSubject(raw);
  git(["add", "-A"]);
  git(["commit", "-m", subject]);
  console.log(`Committed changes on ${branch}: ${subject}`);
}

main();
