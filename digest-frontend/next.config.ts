import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // По умолчанию true в 15.5; даёт сбой RSC manifest (SegmentViewNode) при порче кэша .next
    devtoolSegmentExplorer: false,
  },
  webpack: (config, { dev }) => {
    // Иначе после HMR/incremental compile server-бандл ссылается на несуществующие чанки (MODULE_NOT_FOUND ./NNN.js).
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
