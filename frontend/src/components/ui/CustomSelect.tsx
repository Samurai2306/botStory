import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type CustomSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type Props = {
  value: string
  options: CustomSelectOption[]
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

export default function CustomSelect({
  value,
  options,
  onChange,
  className = '',
  placeholder,
  disabled = false,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = useMemo(() => options.find((opt) => opt.value === value), [options, value])
  const selectedLabel = selected?.label || placeholder || 'Выберите'

  const updateMenuPos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 120),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPos()
  }, [open, updateMenuPos])

  useEffect(() => {
    if (!open) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let raf = 0

    const scheduleUpdate = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateMenuPos)
    }

    window.addEventListener('scroll', scheduleUpdate, true)
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', scheduleUpdate, true)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [open, updateMenuPos])

  return (
    <div ref={rootRef} className={`custom-select ${className}`.trim()}>
      <button
        type="button"
        className="custom-select-trigger"
        ref={triggerRef}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="custom-select-value">{selectedLabel}</span>
        <span className="custom-select-arrow" aria-hidden="true">▾</span>
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="custom-select-menu"
            role="listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              right: 'auto',
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value === '' ? '__empty' : opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`custom-select-option${opt.value === value ? ' is-selected' : ''}`}
                onClick={() => {
                  if (opt.disabled) return
                  onChange(opt.value)
                  setOpen(false)
                }}
                disabled={!!opt.disabled}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
