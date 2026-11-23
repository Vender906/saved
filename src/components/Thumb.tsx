import { useState } from 'react';
import { PLATFORMS, type Platform } from '../platforms';

interface Props {
  src?: string;
  platform: Platform;
  className?: string;
}

/** Превʼю з запасним варіантом: кольорова плашка платформи, якщо картинки немає або вона протухла. */
export function Thumb({ src, platform, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const p = PLATFORMS[platform];
  if (!src || failed) {
    return (
      <div className={`thumb placeholder ${className}`} style={{ background: p.color }}>
        <span>{p.label}</span>
      </div>
    );
  }
  return (
    <div className={`thumb ${className}`}>
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </div>
  );
}
