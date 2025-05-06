import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'glezooxkvbnlgkqzowbd.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**', // Allows any path within the public storage
      },
    ],
  },
};

export default nextConfig;
