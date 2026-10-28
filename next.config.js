/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async rewrites() {
    return [{ source: '/keystone', destination: '/keystone/index.html' }]
  },
}

module.exports = nextConfig
