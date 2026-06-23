export const SUPPORT_EMAIL = "founder@daybreak.rest";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export function SupportEmail({
  children = SUPPORT_EMAIL,
}: Readonly<{ children?: React.ReactNode }>) {
  return <a href={SUPPORT_MAILTO}>{children}</a>;
}
