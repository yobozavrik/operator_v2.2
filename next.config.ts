import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS: enforce HTTPS for 1 year, include subdomains
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-inline' required by Next.js App Router for inline hydration scripts;
              // 'unsafe-eval' required by Next.js in development only.
              // TODO: migrate to nonce-based CSP to remove 'unsafe-inline'.
              process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live"
                : "script-src 'self' 'unsafe-inline' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              // Use env var so the URL isn't hardcoded
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${process.env.NEXT_PUBLIC_SUPABASE_URL || ''} ${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', 'wss://')} https://api.resend.com https://openrouter.ai https://api.openrouter.ai`.trim(),
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

