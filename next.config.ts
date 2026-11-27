import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "unpdf", "pdfjs-dist", "mammoth", "playwright-core", "@sparticuz/chromium"],
  // Background apply launches serverless Chromium: ship playwright-core's runtime files and the Chromium pack with the routes that use them.
  outputFileTracingIncludes: Object.fromEntries(
    ["/api/apply", "/api/apply/run", "/api/ai/chat", "/applications/[id]", "/applications", "/feed"].map((route) => [
      route,
      ["./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*", "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/**/*"],
    ]),
  ),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
