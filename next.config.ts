import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "fotos.sobressai.com.br" },
      { protocol: "https", hostname: "fotos2.fra1.cdn.digitaloceanspaces.com" },
    ],
  },
};

export default nextConfig;
