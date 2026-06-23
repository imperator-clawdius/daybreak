import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_ICON, SITE_TITLE, SITE_URL } from "./site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daybreak",
    short_name: "Daybreak",
    description: SITE_DESCRIPTION,
    start_url: SITE_URL,
    scope: `${SITE_URL}/`,
    display: "standalone",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    icons: [
      {
        src: SITE_ICON,
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["productivity"],
  };
}
