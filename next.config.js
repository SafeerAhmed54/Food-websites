/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation hook for service initialization
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig