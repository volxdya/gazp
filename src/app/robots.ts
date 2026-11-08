import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://neftebaza-twin.example';
  return { rules: [{ userAgent: '*', allow: ['/', '/privacy'], disallow: ['/app', '/api/'] }], sitemap: `${base}/sitemap.xml` };
}
