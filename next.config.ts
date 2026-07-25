import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The directory importer posts the uploaded workbook to a Server Action,
      // and the default cap is 1MB — small enough that a real family
      // spreadsheet fails with a framework error before our own size check can
      // explain itself. Stays under Vercel's 4.5MB request body limit; see
      // MAX_IMPORT_BYTES for the (lower) limit we actually enforce.
      bodySizeLimit: '4mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
