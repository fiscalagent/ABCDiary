interface Props {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  onSubmit?: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export function Numpad({ value, onChange, maxLength = 4, onSubmit }: Props) {
  const press = (d: string) => {
    if (value.length < maxLength) {
      const next = value + d;
      onChange(next);
      if (next.length === maxLength && onSubmit) onSubmit();
    }
  };

  return (
    <div className="numpad">
      <div className="pin-dots">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div key={i} className={`pin-dot${i < value.length ? ' filled' : ''}`} />
        ))}
      </div>
      <div className="numpad-grid">
        {KEYS.map((k, i) =>
          k === '' ? (
            <div key={i} />
          ) : k === '⌫' ? (
            <button
              key={i}
              className="numpad-btn del"
              onClick={() => onChange(value.slice(0, -1))}
              disabled={!value.length}
            >
              ⌫
            </button>
          ) : (
            <button key={i} className="numpad-btn" onClick={() => press(k)}>
              {k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
