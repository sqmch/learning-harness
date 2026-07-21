import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFileInfo } from "prettier";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const fileInfo = (relativePath, ignoreFile) =>
  getFileInfo(path.join(repoRoot, relativePath), {
    ignorePath: path.join(repoRoot, ignoreFile),
  });

test("editor formatting stays enabled for learner scaffold source", async () => {
  const scaffold = await fileInfo("curriculum/01-demo/scaffold/src/App.tsx", ".prettierignore");
  const lesson = await fileInfo("curriculum/01-demo/LESSON.md", ".prettierignore");
  const tutorState = await fileInfo("tutor/progress.json", ".prettierignore");
  const engineSource = await fileInfo("study/src/App.tsx", ".prettierignore");

  assert.equal(scaffold.ignored, false);
  assert.equal(scaffold.inferredParser, "typescript");
  assert.equal(lesson.ignored, true);
  assert.equal(tutorState.ignored, true);
  assert.equal(engineSource.ignored, false);
});

test("engine bulk formatting still excludes all course-owned paths", async () => {
  const coursePaths = [
    "COURSE.md",
    "curriculum/01-demo/LESSON.md",
    "curriculum/01-demo/scaffold/src/App.tsx",
    "tutor/progress.json",
  ];

  for (const relativePath of coursePaths) {
    const info = await fileInfo(relativePath, ".prettierignore.engine");
    assert.equal(info.ignored, true, `${relativePath} must stay outside engine formatting`);
  }

  const engineSource = await fileInfo("study/src/App.tsx", ".prettierignore.engine");
  assert.equal(engineSource.ignored, false);
  assert.equal(engineSource.inferredParser, "typescript");
});

test("nested agent worktrees stay outside both formatting boundaries", async () => {
  const nestedWorktreeSource = ".claude/worktrees/example/study/src/App.tsx";

  for (const ignoreFile of [".prettierignore", ".prettierignore.engine"]) {
    const info = await fileInfo(nestedWorktreeSource, ignoreFile);
    assert.equal(info.ignored, true, `${nestedWorktreeSource} must be ignored by ${ignoreFile}`);
  }
});
