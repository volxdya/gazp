import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifyToken } from '@/lib/server/crypto';
import { store } from '@/lib/server/store';
import Workspace from '@/components/app/Workspace';

export const metadata: Metadata = { title: 'Рабочее место', robots: { index: false, follow: false } };

export default async function AppPage() {
  const session = await verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect('/login?next=/app');
  // Сессия подписана сервером: если экземпляр хранилища не знает пользователя
  // (другая бессерверная функция), доверяем данным из токена
  const user = (await store()).users.find((u) => u.id === session.sub);
  return <Workspace user={user ? { name: user.name, role: user.role, email: user.email } : { name: session.name, role: session.role, email: session.email ?? '' }} />;
}
