import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";

const eslintConfig = defineConfig([
  ...next,
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "coverage/**",
    "evals/results/**",
    "next-env.d.ts",
    "**/*.tsbuildinfo"
  ])
]);

export default eslintConfig;
