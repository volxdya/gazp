import type { NextRequest } from 'next/server';
import { verifyPassword } from '@/lib/server/crypto';
import { withSession } from '@/lib/server/auth-cookie';
import { fail, ipOf, isEmail, json, readJson } from '@/lib/server/http';
import { audit, publicUser, store } from '@/lib/server/store';

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: NextRequest) {
  const ip = ipOf(req);
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return fail(429, 'locked', 'Слишком много попыток. Повторите через минуту.');
  const body = await readJson<{ email?: string; password?: string }>(req);
  if (!body || !isEmail(body.email) || typeof body.password !== 'string') return fail(400, 'bad_request', 'Укажите e-mail и пароль');
  const email = body.email.trim().toLowerCase();
  const user = (await store()).users.find((u) => u.email === email);
  if (!user || !(await verifyPassword(body.password, user.password))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    await audit('security', email, 'login.failed', `Неудачный вход, IP ${ip}, попытка ${n}`);
    return fail(401, 'invalid_credentials', 'Неверный e-mail или пароль');
  }
  attempts.delete(ip);
  await audit('security', user.email, 'login', `Вход в систему, роль ${user.role}`);
  return withSession(json({ user: publicUser(user) }), { sub: user.id, role: user.role, name: user.name, email: user.email });
}
