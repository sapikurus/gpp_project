import { useRef } from 'react';

/**
 * DateInput — shows DD/MM/YYYY visually while keeping YYYY-MM-DD as the stored value.
 * Clicking anywhere on the field opens the native browser calendar picker.
 *
 * Props:
 *   value      — YYYY-MM-DD string (what you store / pass to logic)
 *   onChange   — called with YYYY-MM-DD string when user picks a date
 *   className  — Tailwind classes for the visible container (same as your input styles)
 *   placeholder — shown when no date is selected (default: "DD/MM/YYYY")
 *   disabled   — greys out and blocks interaction
 */
export default function DateInput({
  value = '',
  onChange,
  className = '',
  placeholder = 'DD/MM/YYYY',
  disabled = false,
}) {
  const ref = useRef(null);

  // Convert YYYY-MM-DD → DD/MM/YYYY for display
  const display = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    : '';

  const open = () => {
    if (disabled) return;
    try { ref.current?.showPicker(); }
    catch { ref.current?.click(); }
  };

  return (
    <div className="relative" onClick={open}>
      {/* Visible DD/MM/YYYY display */}
      <div className={`${className} flex items-center justify-between cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <span className={display ? 'text-gray-800' : 'text-gray-400 text-sm'}>
          {display || placeholder}
        </span>
        {/* Calendar icon */}
        <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>

      {/* Hidden native input — handles calendar popup and value */}
      <input
        ref={ref}
        type="date"
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-none"
      />
    </div>
  );
}
