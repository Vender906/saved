import { useState } from 'react';
import { normalizeTag } from '../db';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}

export function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw.split(',').map(normalizeTag).filter(Boolean);
    const next = [...value];
    for (const t of parts) if (!next.includes(t)) next.push(t);
    onChange(next);
    setDraft('');
  };

  const q = normalizeTag(draft);
  const hints = suggestions
    .filter((t) => !value.includes(t) && (!q || t.includes(q)))
    .slice(0, 8);

  return (
    <div>
      <div className="tag-input">
        {value.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Прибрати ${t}`}>×</button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length ? '' : 'рецепти, ремонт, на вихідні…'}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          enterKeyHint="done"
        />
      </div>
      {hints.length > 0 && (
        <div className="tag-hints">
          {hints.map((t) => (
            <button type="button" key={t} className="chip small" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)}>
              +#{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
