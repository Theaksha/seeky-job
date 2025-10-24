import type { NextConfig } from 'next';
import { ALLOWED_ORIGINS } from './config';

const nextConfig: NextConfig = {
  devIndicators: false,
  
  // Add this to ignore ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Optional: Also ignore TypeScript errors during build if needed
  typescript: {
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
