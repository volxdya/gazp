import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, Eye, ShieldCheck, Workflow } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import LoginForm from './LoginForm';
import './login.css';

export const metadata: Metadata = { title: 'Вход', description: 'Вход и регистрация в цифровом двойнике участка технических масел.', alternates: { canonical: '/login' } };

export default function LoginPage() {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link href="/" className="auth-back"><ArrowLeft size={16} /> На главную</Link>
        <Logo light />
        <div className="auth-pitch">
          <h1>Одна база — три взгляда</h1>
          <p>Права доступа зависят от роли и проверяются сервером на каждом действии.</p>
        </div>
        <ul className="roles">
          <li><span className="r-ic o"><ShieldCheck size={20} /></span><div><b>Руководитель</b><span>Все сценарии, журнал безопасности, пользователи и согласия, API</span></div></li>
          <li><span className="r-ic b"><Workflow size={20} /></span><div><b>Диспетчер</b><span>Моделирование, сохранение сценариев, журнал событий, API</span></div></li>
          <li><span className="r-ic t"><Eye size={20} /></span><div><b>Экскурсант</b><span>Схема, 3D-тур, процесс и сравнение готовых сценариев</span></div></li>
        </ul>
        <p className="auth-foot">Соединение защищено HTTPS · данные синтетические</p>
      </aside>
      <main className="auth-main">
        <Suspense><LoginForm /></Suspense>
      </main>
    </div>
  );
}
