/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const dest = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    return [
      { source: '/api/:path*', destination: `${dest}/:path*` },
    ];
  },
};

module.exports = nextConfig;
