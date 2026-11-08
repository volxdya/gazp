import type { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/server/crypto';
import { withSession } from '@/lib/server/auth-cookie';
import { fail, ipOf, isEmail, json, readJson } from '@/lib/server/http';
import { audit, CONSENT_VERSION, mutate, publicUser, type UserRecord } from '@/lib/server/store';

export async function POST(req: NextRequest) {
  const body = await readJson<{ name?: string; email?: string; password?: string; consent?: boolean }>(req);
  if (!body) return fail(400, 'bad_request', 'Некорректный запрос');
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return fail(400, 'name', 'Укажите имя (2–80 символов)');
  if (!isEmail(body.email)) return fail(400, 'email', 'Некорректный e-mail');
  const pw = String(body.password ?? '');
  if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-zА-Яа-я]/.test(pw)) return fail(400, 'password', 'Пароль: от 8 символов, буквы и цифры');
  // 152-ФЗ ст. 9: согласие должно быть конкретным, информированным и сознательным — без отметки регистрация невозможна
  if (body.consent !== true) return fail(400, 'consent', 'Необходимо согласие на обработку персональных данных');
  const email = body.email.trim().toLowerCase();
  const result = await mutate(async (s) => {
    if (s.users.some((u) => u.email === email)) return null;
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: crypto.randomUUID(), email, name, role: 'guest', password: await hashPassword(pw), createdAt: now,
      consent: { version: CONSENT_VERSION, acceptedAt: now, ip: ipOf(req) }
    };
    s.users.push(user);
    return user;
  });
  if (!result) return fail(409, 'exists', 'Пользователь с таким e-mail уже зарегистрирован');
  await audit('security', email, 'register', `Регистрация, согласие на обработку ПДн версии ${CONSENT_VERSION}`);
  return withSession(json({ user: publicUser(result) }, 201), { sub: result.id, role: result.role, name: result.name, email: result.email });
}
