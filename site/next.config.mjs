/** @type {import('next').NextConfig} */

// Base path lets the same build serve two ways:
//  - "" (default) → apex custom domain daybreak.rest (production)
//  - "/daybreak"  → GitHub project Pages preview (imperator-clawdius.github.io/daybreak)
// The CI production job leaves DAYBREAK_BASE_PATH unset.
const basePath = process.env.DAYBREAK_BASE_PATH || "";

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
