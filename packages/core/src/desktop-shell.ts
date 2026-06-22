function normalizeFilePath(url: URL): string {
  return decodeURIComponent(url.pathname).replaceAll("\\", "/").toLowerCase();
}

export function isAllowedDesktopNavigation(
  appEntrypointUrl: string,
  targetUrl: string,
): boolean {
  try {
    const app = new URL(appEntrypointUrl);
    const target = new URL(targetUrl);
    if (app.protocol !== "file:" || target.protocol !== "file:") return false;
    return normalizeFilePath(app) === normalizeFilePath(target);
  } catch {
    return false;
  }
}
