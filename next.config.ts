import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ['pg', 'pg-boss', 'archiver'],
  experimental: {
    // Server Actions carry file uploads only for the local storage driver;
    // R2 uploads go direct from the browser and never touch this limit.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
