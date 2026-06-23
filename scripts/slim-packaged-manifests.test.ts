import { describe, expect, it } from "vitest";
import { slimPackageManifest } from "./slim-packaged-manifests.mjs";

describe("packaged manifest slimming", () => {
  it("removes development-only package metadata while preserving runtime fields", () => {
    expect(
      slimPackageManifest({
        name: "@daybreak/core",
        version: "0.1.0",
        private: true,
        type: "module",
        main: "./dist/index.js",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        scripts: {
          test: "vitest run",
        },
        devDependencies: {
          vitest: "^4.1.9",
        },
        build: {
          publish: [{ provider: "github" }],
        },
      }),
    ).toEqual({
      name: "@daybreak/core",
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
    });
  });
});
