import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` output is only needed for the self-hosted sandbox server.
  // Vercel generates its own output format, so skip it there.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
