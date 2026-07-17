import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb", // carga de boletines (PDF / imagen)
    },
  },
};

export default nextConfig;
