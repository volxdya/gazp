'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Workflow } from 'lucide-react';
import { DEMO } from '@/components/landing/GuestButton';

type Mode = 'login' | 'register';

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/\d/.test(pw) && /[A-Za-zА-Яа-я]/.test(pw)) s++;
  if (/[A-ZА-Я]/.test(pw) && /[a-zа-я]/.test(pw)) s++;
  if (/[^A-Za-zА-Яа-я0-9]/.test(pw) || pw.length >= 12) s++;
  return s;
}

export default function LoginForm() {
  const sp = useSearchParams();
  const next = sp.get('next')?.startsWith('/') && !sp.get('next')!.startsWith('//') ? sp.get('next')! : '/app';
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const submit = async (body: Record<string, unknown>, url: string, tag: string) => {
    setBusy(tag);
    setError(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d?.error?.message ?? 'Не удалось выполнить запрос'); setBusy(null); return; }
      window.location.href = next;
    } catch {
      setError('Нет соединения с сервером. Проверьте сеть и повторите.');
      setBusy(null);
    }
  };

  const st = strength(password);

  return (
    <div className="auth-card rise">
      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(null); }}>Вход</button>
        <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(null); }}>Регистрация</button>
      </div>

      <h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>

      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'login') submit({ email, password }, '/api/auth/login', 'form');
          else submit({ name, email, password, consent }, '/api/auth/register', 'form');
        }}
        noValidate
      >
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="name">Имя</label>
            <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" required minLength={2} maxLength={80} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" required />
        </div>
        <div className="field">
          <label htmlFor="pw">Пароль</label>
          <div className="input-wrap">
            <input id="pw" className="input" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'login' ? 'Ваш пароль' : 'От 8 символов, буквы и цифры'} required />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {mode === 'register' && password && (
            <div className="pw-meter" aria-label={`Надёжность пароля: ${st} из 4`}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < st ? `on s${st}` : ''} />)}
              <span>{['Слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный'][st]}</span>
            </div>
          )}
        </div>

        {mode === 'register' && (
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Согласен на обработку персональных данных по 152-ФЗ и <Link href="/privacy" target="_blank">политике</Link>
            </span>
          </label>
        )}

        {error && <p className="err" role="alert">{error}</p>}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!!busy || (mode === 'register' && !consent)}>
          {busy === 'form' ? <span className="spinner sm" /> : null}
          {mode === 'login' ? 'Войти' : 'Зарегистрироваться'} <ArrowRight size={18} />
        </button>
      </form>

      {mode === 'login' && (
        <div className="demo">
          <div className="demo-sep"><span>демо</span></div>
          <div className="demo-grid">
            <button className="demo-btn" onClick={() => submit(DEMO.admin, '/api/auth/login', 'admin')} disabled={!!busy}><span className="r-ic o"><ShieldCheck size={17} /></span><b>Руководитель</b></button>
            <button className="demo-btn" onClick={() => submit(DEMO.operator, '/api/auth/login', 'operator')} disabled={!!busy}><span className="r-ic b"><Workflow size={17} /></span><b>Диспетчер</b></button>
            <button className="demo-btn" onClick={() => submit(DEMO.guest, '/api/auth/login', 'guest')} disabled={!!busy}><span className="r-ic t"><Eye size={17} /></span><b>Экскурсант</b></button>
          </div>
        </div>
      )}
    </div>
  );
}
