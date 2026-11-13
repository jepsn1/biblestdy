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

/**
 * Type scale (#66): sizes come from the app.css tokens only. Arbitrary rem/px
 * sizes (`text-[0.65rem]`, `text-[13px]`) and Tailwind's own size names
 * (`text-sm` — reset in app.css, so they'd silently do nothing) are errors.
 * em stays allowed: sizes relative to the reading size inside Scripture.
 */
const ARBITRARY_SIZE = /(?<![\w-])(?:[\w-]+:)*text-\[\d*\.?\d+(?:rem|px)\]/g;
const TAILWIND_SIZE = /(?<![\w-])(?:[\w-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g;

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
    "type-scale": classNameRule("Font sizes come from the type scale tokens", (text) =>
      [...text.matchAll(ARBITRARY_SIZE), ...text.matchAll(TAILWIND_SIZE)].map(
        ([m]) =>
          `\`${m}\` is off the type scale — use text-eyebrow/meta/list/control/phone/reading/title/display (app.css).`,
      ),
    ),
  },
};

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
      "biblestdy/type-scale": "error",
    },
  },
  {
    // The contrast test asserts on example class strings.
    files: ["app/**/*.test.ts"],
    rules: { "biblestdy/no-faded-text": "off", "biblestdy/type-scale": "off" },
  },
);
