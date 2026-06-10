import { cva } from 'class-variance-authority'
import type { TextareaHTMLAttributes } from 'react'

const textarea = cva(
  'w-full rounded-sm border border-border bg-surface px-3 py-2 text-[15px] text-ink transition-colors placeholder:text-ink-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
)

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ rows, className, ...rest }: TextareaProps) {
  return <textarea rows={rows ?? 3} className={textarea({ className })} {...rest} />
}
