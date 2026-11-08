'use client';

import { useState } from 'react';

export const DEMO = {
  admin: { email: 'admin@neftebaza.demo', password: 'Admin#2026' },
  operator: { email: 'operator@neftebaza.demo', password: 'Oper#2026' },
  guest: { email: 'guest@neftebaza.demo', password: 'Guest#2026' }
} as const;

export default function GuestButton({ className = 'btn btn-ghost btn-lg', label = 'Экскурсия как гость' }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEMO.guest) }).catch(() => null);
    window.location.href = r?.ok ? '/app' : '/login';
  };
  return <button className={className} onClick={go} disabled={busy}>{label}</button>;
}
