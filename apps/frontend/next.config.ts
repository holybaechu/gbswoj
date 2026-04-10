import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
