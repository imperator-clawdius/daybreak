export interface StartupRegistrationInput {
  platform: string;
  smoke: boolean;
  packaged: boolean;
  autoStart: boolean;
}

export interface StartupRegistrationPlan {
  shouldConfigure: boolean;
  openAtLogin: boolean;
  enabled: boolean;
}

export function planStartupRegistration(
  input: StartupRegistrationInput,
): StartupRegistrationPlan {
  const shouldConfigure =
    input.platform === "win32" && input.packaged && !input.smoke;
  const enabled = shouldConfigure && input.autoStart;
  return {
    shouldConfigure,
    openAtLogin: enabled,
    enabled,
  };
}
