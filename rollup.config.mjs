import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import metablock from "rollup-plugin-userscript-metablock";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/wme-nlsc-overlay.user.js",
    format: "iife",
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
