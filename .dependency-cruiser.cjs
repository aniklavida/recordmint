/**
 * Enforces STRUCTURE.md's structural rule for packages/recorder:
 * plain TypeScript against the web platform, no UI framework. This is the
 * check the infrastructure card requires — it must fail the moment a
 * React (or Next.js) import is added anywhere under packages/recorder/src.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "recorder-imports-no-ui-framework",
      comment:
        "packages/recorder is framework-free by structural decision (STRUCTURE.md §3): testable in a browser harness, reusable in the extension, and rewritable without a framework migration.",
      severity: "error",
      from: { path: "^packages/recorder/src" },
      to: {
        path: [
          "^node_modules/react",
          "^node_modules/react-dom",
          "^node_modules/next",
          "^react$",
          "^react-dom$",
          "^next$",
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
