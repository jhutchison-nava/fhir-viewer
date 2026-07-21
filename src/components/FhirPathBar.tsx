import { useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard } from '@ark-ui/react/clipboard'
import { Combobox } from '@ark-ui/react/combobox'
import { createListCollection } from '@ark-ui/react/collection'
import { Check, CircleAlert, Copy } from 'lucide-react'
import type { Diagnostic } from '~/lib/fhirpath-analyzer'
import { suggest } from '~/lib/fhirpath-analyzer'
import { useAsync } from '~/lib/use-async'
import { TypeLabel } from './TypeLabel'
import { cn } from '~/lib/cn'

interface FhirPathBarProps {
  /** Resource type completions resolve against. */
  resourceType: string
  value: string
  onChange: (expression: string) => void
  /** Runtime evaluation error (shown only when analysis has no error). */
  error?: string
  /** Static-analysis diagnostics for `value` (spans are into `value`). */
  diagnostics?: Diagnostic[]
  resultCount?: number
  placeholder?: string
}

/** Where the caret sits for completion purposes. */
interface CompletionCtx {
  /** Expression to resolve the member list against ('' = resource root). */
  base: string
  /** Partial identifier already typed (filters the list). */
  prefix: string
  /** Offset where the identifier starts (insertion point). */
  identStart: number
}

const SCOPED_FN = /([\w.\[\]'"()]+)\.(where|select|all|exists|repeat)\($/

function completionContext(text: string, caret: number): CompletionCtx | null {
  const upto = text.slice(0, caret)
  const m = upto.match(/([A-Za-z_]\w*)$/)
  const prefix = m?.[1] ?? ''
  const identStart = caret - prefix.length
  const before = upto.slice(0, identStart)
  if (before.endsWith('.')) {
    let base = before.slice(0, -1)
    // Inside a scoped function the member list comes from the item type:
    // `name.where(us` → base chain is `name`.
    const scoped = base.match(SCOPED_FN)
    if (scoped) base = scoped[1]
    return { base, prefix, identStart }
  }
  const trimmed = before.trimEnd()
  if (trimmed === '' || /[(|,]$/.test(trimmed)) {
    const scoped = trimmed.match(SCOPED_FN)
    return { base: scoped ? scoped[1] : '', prefix, identStart }
  }
  return null
}

/** Terminal-prompt-styled expression input with TwoSlash-style squiggles
 * and schema-driven completions at the caret (Ark Combobox). */
export function FhirPathBar({
  resourceType,
  value,
  onChange,
  error,
  diagnostics = [],
  resultCount,
  placeholder,
}: FhirPathBarProps) {
  const [draft, setDraft] = useState(value)
  const [ctx, setCtx] = useState<CompletionCtx | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const draftRef = useRef(value)

  const updateDraft = (next: string) => {
    draftRef.current = next
    setDraft(next)
  }

  // External updates (URL nav, click-to-load from the JSON tree) win — but
  // our own debounced onChange echoes back through `value`; don't let that
  // echo clear the completion context mid-typing.
  useEffect(() => {
    if (value !== draftRef.current) {
      updateDraft(value)
      setCtx(null)
    }
  }, [value])

  // Debounced live evaluation.
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), 300)
    return () => clearTimeout(t)
  }, [draft, value, onChange])

  const refreshCtx = (el: HTMLInputElement) => {
    const caret = el.selectionStart ?? el.value.length
    const next = completionContext(el.value, caret)
    setCtx((prev) => {
      if (prev?.base !== next?.base || prev?.identStart !== next?.identStart) setDismissed(false)
      return next
    })
  }

  const { data: pool } = useAsync(`suggest:${resourceType}:${ctx?.base ?? '∅'}`, () =>
    ctx ? suggest(resourceType, ctx.base) : Promise.resolve([]),
  )

  const matches = useMemo(() => {
    if (!ctx || !pool) return []
    const p = ctx.prefix.toLowerCase()
    return pool
      .filter((c) => c.name.toLowerCase().startsWith(p))
      .slice(0, 20)
  }, [pool, ctx])

  const collection = useMemo(
    () =>
      createListCollection({
        items: matches,
        itemToValue: (c) => c.name,
        itemToString: (c) => c.name,
      }),
    [matches],
  )

  const open = !!ctx && !dismissed && matches.length > 0

  const insert = (name: string) => {
    if (!ctx) return
    const item = matches.find((c) => c.name === name)
    const text = item?.kind === 'function' ? `${name}()` : name
    const caretEnd = ctx.identStart + ctx.prefix.length
    const next = draft.slice(0, ctx.identStart) + text + draft.slice(caretEnd)
    const caret = ctx.identStart + name.length + (item?.kind === 'function' ? (item.hasParams ? 1 : 2) : 0)
    updateDraft(next)
    setCtx(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(caret, caret)
    })
  }

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
      <Combobox.Root
        open={open}
        onOpenChange={({ open: next }) => {
          if (!next) setDismissed(true)
        }}
        inputValue={draft}
        onInputValueChange={({ inputValue }) => updateDraft(inputValue)}
        value={[]}
        onValueChange={({ value: selected }) => selected[0] && insert(selected[0])}
        collection={collection}
        inputBehavior="autohighlight"
        selectionBehavior="preserve"
        allowCustomValue
        openOnClick={false}
        disableLayer
        positioning={{ placement: 'bottom-start', gutter: 4 }}
      >
        <Combobox.Control asChild>
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
              <Combobox.Input asChild>
                <input
                  ref={inputRef}
                  name="fhirpath"
                  onKeyUp={(e) => {
                    // Enter/Escape keyups would instantly reopen the menu
                    // after an accept/dismiss.
                    if (e.key !== 'Enter' && e.key !== 'Escape') refreshCtx(e.currentTarget)
                  }}
                  onClick={(e) => refreshCtx(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !open) onChange(draft)
                    if (e.key === 'Escape' && !open) updateDraft('')
                  }}
                  onBlur={() => setDismissed(true)}
                  placeholder={placeholder ?? "FHIRPath — try name.where(use='official').family"}
                  aria-label="FHIRPath expression"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  className="w-full bg-transparent outline-none placeholder:text-ink-faint"
                />
              </Combobox.Input>
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
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content className="z-40 max-h-64 w-72 overflow-y-auto rounded-md border border-line-strong bg-paper shadow-lg shadow-black/10 outline-none dark:shadow-black/40">
            <Combobox.List>
              {matches.map((c) => (
                <Combobox.Item
                  key={c.name}
                  item={c}
                  className="flex cursor-pointer items-baseline gap-2 px-2.5 py-1 font-mono text-[13px] data-highlighted:bg-panel"
                >
                  <span className={cn('font-medium', c.kind === 'function' && 'text-ink-mid')}>
                    {c.name}
                    {c.kind === 'function' && '()'}
                  </span>
                  {c.types.length > 0 && (
                    <TypeLabel el={{ path: c.name, min: 0, max: '1', types: c.types }} />
                  )}
                  {c.short && (
                    <span className="min-w-0 truncate font-sans text-xs text-ink-faint">
                      {c.short}
                    </span>
                  )}
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>
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
