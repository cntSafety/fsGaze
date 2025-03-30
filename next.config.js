/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Add rewrites for Swagger UI
  async rewrites() {
    return [
      {
        source: '/api-docs',
        destination: '/api-docs.html', // This will serve a static file from the public directory
      },
      {
        source: '/swagger.json',
        destination: '/api/swagger', // This will be handled by an API route
      }
    ];
  }
};

module.exports = nextConfig;
