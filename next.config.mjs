/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['@prisma/client'],
  // Remove experimental config
  webpack: (config) => {
    config.resolve.fallback = { 
      fs: false,
      net: false,
      tls: false 
    };
    return config;
  }
};

export default nextConfig;