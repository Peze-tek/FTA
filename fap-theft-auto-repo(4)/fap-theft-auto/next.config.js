/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // R3F + pointer lock behave better without double-mount in dev
  transpilePackages: ['three'],
};
module.exports = nextConfig;
