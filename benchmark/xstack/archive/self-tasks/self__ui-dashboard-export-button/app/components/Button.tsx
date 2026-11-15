import type { ButtonHTMLAttributes } from 'react'

type Variant = 'default' | 'outline' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base: React.CSSProperties = {
  borderRadius: 6,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const variants: Record<Variant, React.CSSProperties> = {
  default: { background: '#111827', color: 'white', border: '1px solid #111827' },
  outline: { background: 'transparent', color: '#111827', border: '1px solid #d1d5db' },
  ghost: { background: 'transparent', color: '#374151', border: '1px solid transparent' },
  destructive: { background: '#dc2626', color: 'white', border: '1px solid #dc2626' },
}

const sizes: Record<Size, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 13 },
  md: { padding: '8px 14px', fontSize: 14 },
  icon: { padding: 6, fontSize: 14 },
}

export function Button({ variant = 'default', size = 'md', style, ...props }: ButtonProps) {
  return (
    <button
      type='button'
      data-variant={variant}
      data-size={size}
      style={{ ...base, ...variants[variant], ...sizes[size], ...style }}
      {...props}
    />
  )
}
