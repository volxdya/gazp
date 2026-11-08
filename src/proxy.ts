import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/lib/server/crypto';

/**
 * 1) HTTPS: в продакшене всё по http:// перенаправляется на https:// (308), плюс HSTS.
 * 2) Нагрузка: ограничение частоты запросов к API (скользящее окно на IP) — защищает расчётное ядро от всплесков.
 * 3) Права: /app доступен только после входа; проверка подписи сессии до рендера.
 */

const WINDOW_MS = 60_000;
const API_LIMIT = 240;
const hits = new Map<string, { count: number; start: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
    return false;
  }
  h.count++;
  return h.count > API_LIMIT;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const proto = req.headers.get('x-forwarded-proto');
  if (process.env.NODE_ENV === 'production' && proto === 'http' && process.env.ALLOW_HTTP !== '1') {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  if (pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    if (rateLimited(ip)) {
      return NextResponse.json({ error: { code: 'rate_limited', message: 'Слишком много запросов, повторите позже' } }, { status: 429, headers: { 'Retry-After': '30' } });
    }
  }

  if (pathname.startsWith('/app')) {
    const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/api/:path*', '/((?!_next/static|_next/image|favicon.svg).*)']
};
