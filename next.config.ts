import type { NextConfig } from 'next';

const security = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
];

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [{ source: '/:path*', headers: security }];
  }
};
export default config;
