/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure server external packages for Trigger.dev if needed
  serverExternalPackages: ["@trigger.dev/sdk"],
};

export default nextConfig;
