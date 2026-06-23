function normalizeFilePath(url: URL): string {
  return decodeURIComponent(url.pathname).replaceAll("\\", "/").toLowerCase();
}

export function getDesktopContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function shouldDisableDesktopApplicationMenu(): boolean {
  return true;
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
