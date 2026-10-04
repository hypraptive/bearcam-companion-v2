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
 * How the task title is resolved:
 *   The PostTaskExec stdin payload reliably carries `session_id` (and
 *   `hook_event_name`) but does NOT carry the task title directly. Kiro records
 *   each task execution in ~/.kiro/tasks/<hash>/<spec>.meta.json, where every
 *   task entry has an `executionHistory` of { chatSessionId, timestamp }. We
 *   look up the task whose most recent execution matches our `session_id` and
 *   use its title (the task heading, e.g. "2.5 Write unit tests ..."). The
 *   leading task number and markdown backticks are stripped, then the subject
 *   is capped at 72 characters.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
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

/**
 * Find the task title whose execution history matches the given chat session id,
 * scanning all per-spec task metadata files under ~/.kiro/tasks. When a session
 * ran more than one task, the one with the newest matching timestamp wins.
 */
function findTaskTitleBySession(sessionId) {
  if (!sessionId) return undefined;
  const tasksDir = path.join(os.homedir(), ".kiro", "tasks");
  let best;
  let bestTs = -Infinity;

  let subdirs;
  try {
    subdirs = fs.readdirSync(tasksDir);
  } catch {
    return undefined;
  }

  for (const sub of subdirs) {
    const subPath = path.join(tasksDir, sub);
    let files;
    try {
      if (!fs.statSync(subPath).isDirectory()) continue;
      files = fs.readdirSync(subPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".meta.json")) continue;
      let json;
      try {
        json = JSON.parse(fs.readFileSync(path.join(subPath, file), "utf8"));
      } catch {
        continue;
      }
      const tasks = (json && json.tasks) || {};
      for (const [title, task] of Object.entries(tasks)) {
        for (const h of (task && task.executionHistory) || []) {
          if (h && h.chatSessionId === sessionId) {
            const ts = typeof h.timestamp === "number" ? h.timestamp : 0;
            if (ts >= bestTs) {
              bestTs = ts;
              best = task.taskId || title;
            }
          }
        }
      }
    }
  }
  return best;
}

function cleanSubject(title) {
  if (!title) return "Complete task";
  // Strip a leading task number like "2.1 " or "15. ".
  let s = title.replace(/^\d+(\.\d+)*[.)]?\s+/, "");
  // Drop markdown backticks used around code identifiers.
  s = s.replace(/`/g, "");
  // Collapse whitespace and cap length for a clean subject line.
  s = s.replace(/\s+/g, " ").trim().slice(0, 72);
  return s || "Complete task";
}

function deriveSubject(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  const sessionId = payload && (payload.session_id || payload.sessionId);
  const title = findTaskTitleBySession(sessionId);
  return cleanSubject(title);
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
