import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

function runNpm(args: string[]): void {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", ["npm", ...args].join(" ")], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync("npm", args, {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

describe("core package artifact", () => {
  it("is importable by plain Node ESM after build", () => {
    runNpm(["run", "build", "-w", "@daybreak/core"]);

    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        [
          "const mod = await import('./packages/core/dist/index.js');",
          "if (typeof mod.canDismiss !== 'function') {",
          "  throw new Error('canDismiss export missing');",
          "}",
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        stdio: "pipe",
      },
    );
  });
});
