import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function ciWorkflowSource(): string {
  return readFileSync(".github/workflows/check.yml", "utf8");
}

describe("CI workflow", () => {
  it("runs the professional repo gates on pushes and pull requests", () => {
    const workflow = ciWorkflowSource();

    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm audit --omit=dev --audit-level=moderate");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm run verify:local-only");
    expect(workflow).toContain("npm run verify:readiness -- --allow-pending");
  });

  it("checks live production drift only on main pushes", () => {
    const workflow = ciWorkflowSource();

    expect(workflow).toContain("npm run verify:launch");
    expect(workflow).toContain("npm run verify:pages-health");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
  });
});
