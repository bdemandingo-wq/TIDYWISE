import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import noDeviceLocalDates from "./eslint-rules/no-device-local-dates.js";
import queryStates from "./eslint-rules/query-states.js";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      // Local rules. See eslint-rules/no-device-local-dates.js for why this
      // exists: two manual greps failed to enumerate device-local date maths
      // because they searched for what the code imported rather than what it
      // did. A linter sees the operation.
      local: { rules: { "no-device-local-dates": noDeviceLocalDates, "query-states": queryStates } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // "warn" not "error" for now — turning ~50 files red would block every
      // other lint signal. Promote to error once the backlog is cleared.
      "local/no-device-local-dates": "warn",
      // Warn, not error: there is a real backlog of existing call sites and
      // failing the build on all of them would just get the rule disabled.
      "local/query-states": "warn",
    },
  },
);
