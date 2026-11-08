'use client';
import { Minus, Plus } from 'lucide-react';

export function Stepper({ value, min, max, step = 1, onChange, disabled, label, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; label: string; format?: (v: number) => string }) {
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - step)} disabled={disabled || value <= min} aria-label={`Уменьшить: ${label}`}><Minus size={18} strokeWidth={2.5} /></button>
      <output aria-live="polite">{format ? format(value) : value}</output>
      <button type="button" onClick={() => set(value + step)} disabled={disabled || value >= max} aria-label={`Увеличить: ${label}`}><Plus size={18} strokeWidth={2.5} /></button>
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}
