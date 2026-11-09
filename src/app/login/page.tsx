import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import LoginForm from './LoginForm';
import './login.css';

export const metadata: Metadata = { title: 'Вход', description: 'Вход и регистрация в цифровом двойнике отгрузки бензина.', alternates: { canonical: '/login' } };

export default function LoginPage() {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link href="/" className="auth-back"><ArrowLeft size={16} /> На главную</Link>
        <Logo />
        <div className="auth-pitch">
          <h1>Цифровой двойник отгрузки бензина</h1>
        </div>
        <p className="auth-foot">Синтетические данные</p>
      </aside>
      <main className="auth-main">
        <Suspense><LoginForm /></Suspense>
      </main>
    </div>
  );
}
