// Flat ESLint config for the praxeum engine. Two code groups, one shared
// formatter truce:
//   - scripts/**       the enforcement CLIs + their node:test suites (plain Node ESM)
//   - study/**         the study app (TypeScript: React front-end + Express server)
// Recommended rule sets only — guard-rails, not a refactor mandate — and
// eslint-config-prettier last so no lint rule fights Prettier over formatting.
//
// This file is engine-owned. Instances pull it via `npm run update`, so it must
// never reach into course paths (COURSE.md, curriculum/, tutor/): those carry no
// engine code and belong to the learner's repo.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Build output, vendored deps, and every course path stay unlinted. The
    // illustrative example module (docs/example-module/) is course-shaped content,
    // not engine source — its scaffold ships deliberate TODO(you) gaps — so it's
    // excluded here for the same reason curriculum/ is.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "curriculum/**",
      "tutor/**",
      "docs/example-module/**",
    ],
  },
  {
    // A disable comment that no longer suppresses anything is a lie — fail on it,
    // so the targeted disables in this tree can only ever be load-bearing.
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    // The enforcement scripts and their tests: Node, ESM, no types.
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Allow the `const { drop, ...rest } = obj` omit idiom (used in tests to
      // strip a required field) without flagging the deliberately-unused sibling.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // The study app. typescript-eslint's recommended set turns off the core
    // rules TypeScript makes redundant (e.g. no-undef); react-hooks catches the
    // dependency-array and rules-of-hooks mistakes the lab components can hit.
    files: ["study/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  prettier,
);
