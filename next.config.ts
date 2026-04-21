import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com bindings nativos/WASM — não podem ser empacotados pelo Turbopack
  serverExternalPackages: ["sharp", "@resvg/resvg-js", "satori"],

  images: {
    remotePatterns: [
      // Cloudflare R2 public subdomain (canvas-generated images)
      { protocol: "https", hostname: "*.r2.dev" },
      // Cloudflare R2 direct bucket URL (signed/internal)
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      // Firebase Storage (client logos)
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      // Freepik CDN (generated images from old pipeline)
      { protocol: "https", hostname: "*.freepik.com" },
      { protocol: "https", hostname: "*.freepikcompany.com" },
    ],
  },

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
