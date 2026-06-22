export interface StartupRegistrationInput {
  platform: string;
  smoke: boolean;
  packaged: boolean;
}

export interface StartupRegistrationPlan {
  shouldRegister: boolean;
  openAtLogin: boolean;
}

export function planStartupRegistration(
  input: StartupRegistrationInput,
): StartupRegistrationPlan {
  const shouldRegister =
    input.platform === "win32" && input.packaged && !input.smoke;
  return {
    shouldRegister,
    openAtLogin: shouldRegister,
  };
}
