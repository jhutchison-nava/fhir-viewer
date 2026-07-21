import { useEffect, useRef, useState } from 'react'
import { Clipboard } from '@ark-ui/react/clipboard'
import { Check, CircleAlert, Copy } from 'lucide-react'
import { cn } from '~/lib/cn'

interface FhirPathBarProps {
  value: string
  onChange: (expression: string) => void
  error?: string
  resultCount?: number
  placeholder?: string
}

/** Terminal-prompt-styled expression input. Evaluation is live (debounced
 * upstream); Enter forces immediate re-evaluation. */
export function FhirPathBar({ value, onChange, error, resultCount, placeholder }: FhirPathBarProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // External updates (URL nav, click-to-load from the JSON tree) win.
  useEffect(() => setDraft(value), [value])

  // Debounced live evaluation.
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), 300)
    return () => clearTimeout(t)
  }, [draft, value, onChange])

  return (
    <div>
      <label
        className={cn(
          'flex items-center gap-2 rounded-sm border bg-panel px-2.5 py-1.5 font-mono text-sm',
          error ? 'border-flame/60' : 'border-line focus-within:border-line-strong',
        )}
      >
        <span aria-hidden className="select-none font-semibold text-flame">
          ›
        </span>
        <input
          ref={inputRef}
          name="fhirpath"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onChange(draft)
            if (e.key === 'Escape') setDraft('')
          }}
          placeholder={placeholder ?? "FHIRPath — try name.where(use='official').family"}
          aria-label="FHIRPath expression"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="w-full bg-transparent outline-none placeholder:text-ink-faint"
        />
        {value && !error && resultCount !== undefined && (
          <span className="shrink-0 text-xs text-ink-faint">
            {resultCount} result{resultCount === 1 ? '' : 's'}
          </span>
        )}
        {draft && (
          <Clipboard.Root value={draft} timeout={1200} className="flex shrink-0">
            <Clipboard.Trigger
              aria-label="Copy expression"
              className="rounded-sm p-1 text-ink-faint hover:bg-inset hover:text-ink data-copied:text-t-primitive"
            >
              <Clipboard.Indicator copied={<Check size={13} />}>
                <Copy size={13} />
              </Clipboard.Indicator>
            </Clipboard.Trigger>
          </Clipboard.Root>
        )}
      </label>
      {error && (
        <p className="mt-1 flex items-start gap-1.5 font-mono text-xs text-flame">
          <CircleAlert size={13} className="mt-px shrink-0" aria-hidden />
          <span className="break-all">{error}</span>
        </p>
      )}
    </div>
  )
}
