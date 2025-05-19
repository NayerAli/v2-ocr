/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude Supabase Deno functions from webpack build
    config.module.rules.push({
      test: /supabase-docker\/volumes\/functions/,
      loader: 'ignore-loader',
    });
    
    return config;
  },
};

export default nextConfig;
