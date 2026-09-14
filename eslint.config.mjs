import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";

const uiMessage =
  "Use @worknaru/ui public components. See docs/ui-design.md and the matching Storybook example.";
const boundary = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name === "style")
          context.report({
            node,
            message:
              "Use a CSS Module with design tokens; inline visual overrides bypass the UI contract. See docs/ui-design.md.",
          });
      },
    };
  },
};
export default [
  { ignores: ["**/dist/**", "**/storybook-static/**", "**/node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "no-duplicate-imports": "error",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { worknaru: { rules: { "no-inline-style": boundary } } },
    rules: {
      "worknaru/no-inline-style": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "radix-ui",
                "@radix-ui/*",
                "lucide-react",
                "@worknaru/ui/*",
                "**/packages/ui/src/**",
              ],
              message: uiMessage,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@worknaru/core",
                "@worknaru/runtime",
                "@worknaru/paseo-adapter",
                "@getpaseo/*",
              ],
              message:
                "UI receives data and explicit callbacks; product operations belong to apps/web features.",
            },
          ],
        },
      ],
    },
  },
];
