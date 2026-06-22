import { readFileSync } from "node:fs";
import { join } from "node:path";

const BANNED_SOURCE_PATTERNS = [
  { label: "fetch", pattern: /\bfetch\s*\(/ },
  { label: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { label: "navigator.sendBeacon", pattern: /\bnavigator\s*\.\s*sendBeacon\b/ },
  { label: "WebSocket", pattern: /\bWebSocket\b/ },
  { label: "EventSource", pattern: /\bEventSource\b/ },
  { label: "node:http", pattern: /from\s+["']node:http["']|require\(["']node:http["']\)/ },
  { label: "node:https", pattern: /from\s+["']node:https["']|require\(["']node:https["']\)/ },
  { label: "http module", pattern: /from\s+["']http["']|require\(["']http["']\)/ },
  { label: "https module", pattern: /from\s+["']https["']|require\(["']https["']\)/ },
  { label: "electron net", pattern: /\bnet\s*\.\s*request\b/ },
  { label: "remote URL", pattern: /\bhttps?:\/\/|(?<!:)\/\/[a-z0-9.-]/i },
];

const BANNED_DEPENDENCIES = [
  "@sentry",
  "amplitude",
  "analytics",
  "datadog",
  "fullstory",
  "hotjar",
  "logrocket",
  "mixpanel",
  "newrelic",
  "posthog",
  "rudder",
  "segment",
  "telemetry",
];

export const DESKTOP_RUNTIME_FILES = [
  "desktop/src/main/main.ts",
  "desktop/src/main/preload.ts",
  "desktop/src/main/store.ts",
  "desktop/src/renderer/index.html",
  "desktop/src/renderer/renderer.css",
  "desktop/src/renderer/renderer.ts",
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findSourceViolations(files) {
  const violations = [];
  for (const file of files) {
    const text = stripComments(file.text);
    for (const rule of BANNED_SOURCE_PATTERNS) {
      if (rule.pattern.test(text)) {
        violations.push({
          type: "source",
          path: file.path,
          rule: rule.label,
        });
      }
    }
  }
  return violations;
}

function findDependencyViolations(dependencies = {}) {
  const names = Object.keys(dependencies);
  return names
    .filter((name) =>
      BANNED_DEPENDENCIES.some((banned) => name.toLowerCase().includes(banned)),
    )
    .map((name) => ({
      type: "dependency",
      path: "desktop/package.json",
      rule: name,
    }));
}

export function evaluateLocalOnlyPolicy({ files, dependencies }) {
  const sourceViolations = findSourceViolations(files);
  const dependencyViolations = findDependencyViolations(dependencies);
  const violations = [...sourceViolations, ...dependencyViolations];
  return {
    pass: violations.length === 0,
    checkedFiles: files.map((file) => file.path),
    checkedDependencies: Object.keys(dependencies ?? {}),
    violations,
  };
}

export function renderLocalOnlyReport(result) {
  const lines = [
    `LOCAL_ONLY=${result.pass ? "pass" : "fail"}`,
    `LOCAL_ONLY_FILES=${result.checkedFiles.join(",") || "none"}`,
    `LOCAL_ONLY_DEPENDENCIES=${result.checkedDependencies.join(",") || "none"}`,
  ];
  for (const violation of result.violations) {
    lines.push(
      `LOCAL_ONLY_VIOLATION type=${violation.type} path=${violation.path} rule=${violation.rule}`,
    );
  }
  return lines.join("\n");
}

export function readLocalOnlyInputs(root = process.cwd()) {
  const files = DESKTOP_RUNTIME_FILES.map((relativePath) => ({
    path: relativePath,
    text: readFileSync(join(root, relativePath), "utf8"),
  }));
  const desktopPackage = JSON.parse(
    readFileSync(join(root, "desktop/package.json"), "utf8"),
  );
  return {
    files,
    dependencies: desktopPackage.dependencies ?? {},
  };
}
