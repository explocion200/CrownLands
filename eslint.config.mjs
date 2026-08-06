export default [
  {
    files: ["*.js", "functions/*.js"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
    },
    rules: {
      "no-unused-vars": ["error", {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "all",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["game.js"],
    rules: {
      "no-unused-vars": ["error", {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "local",
      }],
    },
  },
  {
    files: ["functions/*.js"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        exports: "writable",
        fetch: "readonly",
        module: "writable",
        process: "readonly",
        require: "readonly",
        setTimeout: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
];
