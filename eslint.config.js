import tseslint from "typescript-eslint";

const typescriptFiles = ["src/**/*.ts", "test/**/*.ts"];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: typescriptFiles }))
);
