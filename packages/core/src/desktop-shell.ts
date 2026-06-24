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
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function shouldDisableDesktopApplicationMenu(): boolean {
  return true;
}

export function shouldDisableDesktopDevTools(): boolean {
  return true;
}

export function shouldEnforceDesktopSingleInstance(): boolean {
  return true;
}

export function shouldGuardDesktopRedirects(): boolean {
  return true;
}

export function shouldGuardDesktopFrameNavigation(): boolean {
  return true;
}

export function shouldPreventDesktopDragDropNavigation(): boolean {
  return true;
}

export function shouldPreventDesktopDownloads(): boolean {
  return true;
}

export function shouldPreventDesktopClipboardExfiltration(): boolean {
  return true;
}

export function shouldPreventDesktopContextMenu(): boolean {
  return true;
}

export function shouldEnableDesktopContentProtection(): boolean {
  return true;
}

export function shouldStartDesktopPowerSaveBlocker(): boolean {
  return true;
}

export function shouldDenyDesktopPermission(_permission: string): boolean {
  return true;
}

export function shouldRejectDesktopCertificateError(_input: {
  url: string;
  error: string;
}): boolean {
  return true;
}

export function getDesktopWindowChromePolicy() {
  return {
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    movable: false,
    resizable: false,
  } as const;
}

export function getDesktopWebPreferencesPolicy() {
  return {
    allowRunningInsecureContent: false,
    backgroundThrottling: false,
    contextIsolation: true,
    devTools: false,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    webSecurity: true,
    webviewTag: false,
  } as const;
}

export type DesktopShortcutInput = {
  key?: string;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export function shouldBlockDesktopShortcut(input: DesktopShortcutInput): boolean {
  const key = input.key?.toLowerCase();
  const command = Boolean(input.control || input.meta);
  if (!key) return false;

  if (key === "f5" || key === "f11" || key === "f12") return true;
  if (input.alt && (key === "arrowleft" || key === "arrowright")) return true;
  if (command && (key === "r" || key === "n" || key === "p" || key === "s")) {
    return true;
  }
  if (command && (key === "=" || key === "+" || key === "-" || key === "0")) {
    return true;
  }
  if (command && input.shift && (key === "i" || key === "j" || key === "c")) {
    return true;
  }
  if (input.meta && input.alt && (key === "i" || key === "j" || key === "c")) {
    return true;
  }

  return false;
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
