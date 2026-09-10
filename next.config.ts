import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "fotos.sobressai.com.br" },
      { protocol: "https", hostname: "fotos2.fra1.cdn.digitaloceanspaces.com" },
    ],
  },
};

export default nextConfig;
