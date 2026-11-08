import { Fuel } from 'lucide-react';

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="logo" style={light ? { color: '#fff' } : undefined}>
      <span className="logo-mark"><Fuel size={compact ? 22 : 24} strokeWidth={2.2} /></span>
      {!compact && (
        <span className="logo-text">
          <b>Северная</b>
          <span style={light ? { color: 'rgba(255,255,255,.7)' } : undefined}>двойник участка масел</span>
        </span>
      )}
    </span>
  );
}
