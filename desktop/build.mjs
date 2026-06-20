// esbuild pipeline for the Electron app.
// - main + preload: node platform, electron kept external
// - renderer: browser platform, @daybreak/core bundled in
// - static renderer assets copied to dist/
import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, "dist");
await mkdir(out, { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  target: "es2022",
};

await build({
  ...common,
  entryPoints: [resolve(root, "src/main/main.ts")],
  outfile: resolve(out, "main.js"),
  platform: "node",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...common,
  entryPoints: [resolve(root, "src/main/preload.ts")],
  outfile: resolve(out, "preload.js"),
  platform: "node",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...common,
  entryPoints: [resolve(root, "src/renderer/renderer.ts")],
  outfile: resolve(out, "renderer.js"),
  platform: "browser",
  format: "iife",
});

await cp(resolve(root, "src/renderer/index.html"), resolve(out, "index.html"));
await cp(resolve(root, "src/renderer/renderer.css"), resolve(out, "renderer.css"));

console.log("daybreak desktop bundle complete →", out);
