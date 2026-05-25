import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import metablock from "rollup-plugin-userscript-metablock";

// Bake package.json#version into the bundle as a const so the sidebar heading
// can show it without relying on GM_info at runtime (some Tampermonkey/Greasy
// sandbox setups don't expose GM_info to scripts that use @grant).
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolvePath(__dirname, "package.json"), "utf8"),
);

export default {
  input: "src/index.ts",
  output: {
    file: "dist/wme-nlsc-overlay.user.js",
    format: "iife",
    intro: `const __SCRIPT_VERSION__ = ${JSON.stringify(pkg.version)};`,
  },
  plugins: [
    typescript({
      tsconfig: false,
      compilerOptions: {
        target: "ES2020",
        module: "ES2015",
      },
    }),
    resolve(),
    commonjs(),
    metablock({
      file: "./metablock.json",
    }),
  ],
};
