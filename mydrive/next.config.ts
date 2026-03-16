import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/ws/:path*",
        destination: "http://localhost:1234/:path*",
      },
    ];
  },
};

export default nextConfig;
