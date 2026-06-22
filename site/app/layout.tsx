import type { Metadata } from "next";
import "./globals.css";

import { SITE_DESCRIPTION, SITE_IMAGE, SITE_TITLE, SITE_URL } from "./site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    "morning routine app",
    "Windows focus app",
    "intent setting",
    "daily commitments",
    "productivity",
    "ship discipline",
  ],
  alternates: {
    canonical: `${SITE_URL}/`,
  },
  openGraph: {
    title: SITE_TITLE,
    description:
      "Full-screen at first login. You can't dismiss it until every item is wiped. $19 once, no subscription.",
    url: SITE_URL,
    siteName: "Daybreak",
    type: "website",
    images: [
      {
        url: SITE_IMAGE,
        width: 1002,
        height: 753,
        alt: "Daybreak Windows app showing a morning commitment ready to be wiped",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description:
      "Full-screen at first login. You can't dismiss it until every item is wiped. $19 once.",
    images: [SITE_IMAGE],
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
