import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp requires native binaries — must be external on Vercel/Lambda
  serverExternalPackages: ["sharp"],

  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
