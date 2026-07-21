import { useEffect, useRef, useState } from 'react'
import { Clipboard } from '@ark-ui/react/clipboard'
import { Check, CircleAlert, Copy } from 'lucide-react'
import type { Diagnostic } from '~/lib/fhirpath-analyzer'
import { cn } from '~/lib/cn'

interface FhirPathBarProps {
  value: string
  onChange: (expression: string) => void
  /** Runtime evaluation error (shown only when analysis has no error). */
  error?: string
  /** Static-analysis diagnostics for `value` (spans are into `value`). */
  diagnostics?: Diagnostic[]
  resultCount?: number
  placeholder?: string
}

/** Terminal-prompt-styled expression input with TwoSlash-style squiggles:
 * a monospace mirror line under the input carries ~~~ markers at diagnostic
 * spans, and did-you-mean messages apply their fix on click. */
export function FhirPathBar({
  value,
  onChange,
  error,
  diagnostics = [],
  resultCount,
  placeholder,
}: FhirPathBarProps) {
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

  // Diagnostics are computed against `value`; only mark when the input shows
  // that exact text (mid-typing the columns would be stale).
  const settled = draft === value
  const marked = settled ? diagnostics.filter((d) => d.start < draft.length) : []
  const hasError = marked.some((d) => d.severity === 'error')

  const applyFix = (d: Diagnostic) => {
    if (!d.didYouMean) return
    onChange(value.slice(0, d.start) + d.didYouMean + value.slice(d.start + d.length))
    inputRef.current?.focus()
  }

  return (
    <div>
      <label
        className={cn(
          'flex items-center gap-2 rounded-sm border bg-panel px-2.5 py-1.5 font-mono text-sm',
          hasError || error ? 'border-flame/60' : 'border-line focus-within:border-line-strong',
        )}
      >
        <span aria-hidden className="select-none font-semibold text-flame">
          ›
        </span>
        <div className="min-w-0 flex-1">
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
          {marked.length > 0 && <MarkerLine text={draft} diagnostics={marked} />}
        </div>
        {value && !error && !hasError && resultCount !== undefined && (
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
      {settled &&
        diagnostics.map((d, i) => (
          <p
            key={i}
            className={cn(
              'mt-1 flex items-start gap-1.5 font-mono text-xs',
              d.severity === 'error' ? 'text-flame' : 'text-t-choice',
            )}
          >
            <CircleAlert size={13} className="mt-px shrink-0" aria-hidden />
            <span className="break-all">
              col {d.start + 1}: {d.message}
              {d.didYouMean && (
                <>
                  {' — did you mean '}
                  <button
                    type="button"
                    onClick={() => applyFix(d)}
                    className="font-semibold underline decoration-dotted hover:decoration-solid"
                  >
                    {d.didYouMean}
                  </button>
                  ?
                </>
              )}
            </span>
          </p>
        ))}
      {error && !diagnostics.some((d) => d.severity === 'error') && (
        <p className="mt-1 flex items-start gap-1.5 font-mono text-xs text-flame">
          <CircleAlert size={13} className="mt-px shrink-0" aria-hidden />
          <span className="break-all">{error}</span>
        </p>
      )}
    </div>
  )
}

/** Column-aligned ~~~ markers; works because input and mirror share the
 * same monospace font and left edge. */
function MarkerLine({ text, diagnostics }: { text: string; diagnostics: Diagnostic[] }) {
  const runs: { char: string; className?: string }[] = []
  const sorted = [...diagnostics].sort((a, b) => a.start - b.start)
  let cursor = 0
  for (const d of sorted) {
    if (d.start < cursor) continue // overlapping spans: keep the first
    if (d.start > cursor) runs.push({ char: ' '.repeat(d.start - cursor) })
    const len = Math.max(1, Math.min(d.length, text.length - d.start))
    runs.push({
      char: '~'.repeat(len),
      className: d.severity === 'error' ? 'text-flame' : 'text-t-choice',
    })
    cursor = d.start + len
  }
  return (
    <div aria-hidden className="-mt-1 select-none overflow-hidden whitespace-pre text-sm leading-none">
      {runs.map((run, i) => (
        <span key={i} className={run.className}>
          {run.char}
        </span>
      ))}
    </div>
  )
}
