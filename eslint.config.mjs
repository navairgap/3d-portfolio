import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // TypeScript — keep the guardrails that catch real mistakes
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",

      // React — the single big useEffect manages an imperative Three.js
      // world with its own effectActive/worldDisposed guards, so the
      // dependency lint would only produce noise here
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "error",

      // Next.js — the logo <img> inside the canvas overlay is deliberate
      // (next/image adds nothing for a 70px fixed asset). The Google Fonts
      // <link> in the root layout is also deliberate: React 19 hoists it to
      // <head> for every page, and the canvas textures draw text with the
      // literal 'Poppins' family, so a hashed next/font family would break
      // them (the rule itself is a pages-router relic).
      "@next/next/no-img-element": "off",
      "@next/next/no-page-custom-font": "off",

      // General JavaScript — console.* is used for intentional, useful
      // diagnostics (GPU degrade notices, asset failure warnings)
      "prefer-const": "error",
      "no-console": "off",
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-redeclare": "error",
      "no-useless-escape": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
];

export default eslintConfig;
