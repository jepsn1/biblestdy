// Web lint (#68): a11y (jsx-a11y), hooks rules, and two design-system rules
// that keep text legible — see `biblestdy/*` below.
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** Text colour tokens tuned to ≥ 4.5:1 on their background (app.css). */
const TEXT_TOKENS =
  "foreground|muted-foreground|primary|primary-foreground|secondary-foreground|accent-foreground|card-foreground|popover-foreground|destructive|sidebar-foreground|sidebar-primary|sidebar-accent-foreground";

/** `text-primary/80`, `hover:text-muted-foreground/60` — opacity drops the token below AA. */
const FADED_TEXT = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*text-(?:${TEXT_TOKENS})/\\d+`, "g");

/** Arbitrary font sizes `text-[0.65rem]`, `text-[11px]` (rem/px only; em is relative). */
const ARBITRARY_SIZE = /(?<![\w-])(?:[\w-]+:)*text-\[(\d*\.?\d+)(rem|px)\]/g;
const MIN_PX = 12;

/** Report every regex match inside string literals and template chunks. */
function classNameRule(description, scan) {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create(context) {
      const check = (node, text) => {
        for (const message of scan(text)) context.report({ node, message });
      };
      return {
        Literal: (node) => typeof node.value === "string" && check(node, node.value),
        TemplateElement: (node) => check(node, node.value.cooked ?? node.value.raw),
      };
    },
  };
}

const biblestdy = {
  rules: {
    "no-faded-text": classNameRule("Ban opacity modifiers on text colour tokens", (text) =>
      [...text.matchAll(FADED_TEXT)].map(
        ([m]) =>
          `\`${m}\` fades a text colour token below AA contrast — use the token itself, or add a token that passes.`,
      ),
    ),
    "no-small-text": classNameRule("Ban arbitrary font sizes below 12px", (text) =>
      [...text.matchAll(ARBITRARY_SIZE)]
        .filter(([, n, unit]) => Number(n) * (unit === "rem" ? 16 : 1) < MIN_PX)
        .map(([m]) => `\`${m}\` is below ${MIN_PX}px — use \`text-xs\` or larger.`),
    ),
  },
};

/**
 * Files being rewritten in parallel by #62 (overlays & settings) and #63
 * (annotations + highlight menu). Rules they currently break are `warn` here
 * so this lands without touching them; flip to error after wave 2.
 */
const WAVE2_FILES = [
  "app/reader/account-settings.tsx",
  "app/reader/style-chooser.tsx",
  "app/reader/note-panel.tsx",
  "app/reader/connections-panel.tsx",
  "app/reader/reader-nav.tsx",
  "app/reader/paginated-chapter.tsx",
  "app/reader/chapter-text.tsx",
  "app/reader/annotation-marks.tsx",
  "app/reader/highlight-marks.tsx",
];

export default tseslint.config(
  { ignores: ["build/", "dist/", ".react-router/", "public/", "dev-dist/"] },
  {
    files: ["app/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint.plugin,
      biblestdy,
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "biblestdy/no-faded-text": "error",
      "biblestdy/no-small-text": "error",
    },
  },
  {
    files: WAVE2_FILES,
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      "biblestdy/no-small-text": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
    },
  },
  {
    // The contrast test asserts on example class strings.
    files: ["app/**/*.test.ts"],
    rules: { "biblestdy/no-faded-text": "off", "biblestdy/no-small-text": "off" },
  },
);
