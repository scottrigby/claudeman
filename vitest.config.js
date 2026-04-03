import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.js"],
          exclude: ["test/**/*.integration.test.js", "test/**/*.e2e.test.js"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/**/*.integration.test.js"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["test/**/*.e2e.test.js"],
        },
      },
    ],
  },
});
