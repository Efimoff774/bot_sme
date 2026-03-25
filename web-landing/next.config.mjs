/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Adjust to your Supabase storage domain later
      { protocol: 'https', hostname: '**' }
    ]
  }
};

export default nextConfig;

