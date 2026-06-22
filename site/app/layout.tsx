import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://daybreak.rest";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Daybreak — wipe the morning before it owns you",
  description:
    "A Windows app that takes over your screen at first login and won't let go until you've wiped every commitment. Morning intent, evening review, weekly streak. $19 once.",
  keywords: [
    "morning routine app",
    "Windows focus app",
    "intent setting",
    "daily commitments",
    "productivity",
    "ship discipline",
  ],
  openGraph: {
    title: "Daybreak — wipe the morning before it owns you",
    description:
      "Full-screen at first login. You can't dismiss it until every item is wiped. $19 once, no subscription.",
    url: SITE_URL,
    siteName: "Daybreak",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Daybreak — wipe the morning before it owns you",
    description:
      "Full-screen at first login. You can't dismiss it until every item is wiped. $19 once.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
