import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const directoryName = dirname(filename);
const compatibility = new FlatCompat({
  baseDirectory: directoryName
});

const eslintConfiguration = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts"
    ]
  },
  ...compatibility.extends("next/core-web-vitals", "next/typescript")
];

export default eslintConfiguration;
