import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  options: string[];
  exclude?: string[];
  placeholder?: string;
  onSelect: (name: string) => void;
}

function useMenuPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 10000,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef]);

  return style;
}

export function TaPicker({ options, exclude = [], placeholder = 'Thêm TG…', onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const menuStyle = useMenuPosition(open, inputRef);

  const available = options.filter((o) => !exclude.includes(o));
  const q = query.trim().toLowerCase();
  const filtered = (q
    ? available.filter((o) => o.toLowerCase().includes(q))
    : available
  ).slice(0, 12);

  const showMenu = open && filtered.length > 0;
  const showEmpty = open && !!q && filtered.length === 0;

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const floating = document.querySelector('.ta-picker-menu--floating');
      if (floating?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (name: string) => {
    onSelect(name);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[activeIdx]) pick(filtered[activeIdx]);
      else if (query.trim()) pick(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const menuPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {showMenu && (
              <ul
                className="ta-picker-menu ta-picker-menu--floating"
                id={listId}
                role="listbox"
                style={menuStyle}
              >
                <li className="ta-picker-menu-hint" aria-hidden="true">
                  {q ? `${filtered.length} kết quả` : 'Gõ để lọc · Enter để thêm'}
                </li>
                {filtered.map((name, i) => (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeIdx}
                      className={`ta-picker-option ${i === activeIdx ? 'active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => pick(name)}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showEmpty && (
              <div className="ta-picker-empty ta-picker-menu--floating" style={menuStyle}>
                Không tìm thấy — Enter để thêm &quot;{query.trim()}&quot;
              </div>
            )}
          </>,
          document.body,
        )
      : null;

  return (
    <div className={`ta-picker ${open ? 'ta-picker--open' : ''}`} ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        className="ta-picker-input"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
      />
      {menuPortal}
    </div>
  );
}
