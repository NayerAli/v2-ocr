/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['canvas', '@napi-rs/canvas'],
    outputFileTracingIncludes: {
      // s’assure que le worker est copié dans .next/standalone
      '/**/*': ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs']
    }
  },
  webpack: (config, { isServer }) => {
    // Exclude Supabase Deno functions from webpack build
    config.module.rules.push({
      test: /supabase-docker\/volumes\/functions/,
      loader: 'ignore-loader',
    });

    // Externalize @napi-rs/canvas for server-side
    if (isServer) {
      config.externals.push('@napi-rs/canvas');
    }

    return config;

  },
};

export default nextConfig;
