import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com bindings nativos/WASM — não podem ser empacotados pelo Turbopack
  serverExternalPackages: ["sharp", "@resvg/resvg-js", "satori"],

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
