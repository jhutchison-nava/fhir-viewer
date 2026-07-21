import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { getCatalog, prefetchChunk, type Catalog } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'
import { cn } from '~/lib/cn'

/** Cmd-K jump palette over the resource catalog. */
export function SearchPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  return <PaletteDialog onClose={() => setOpen(false)} />
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { data: catalog } = useAsync('catalog', getCatalog)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const matches = useMemo(() => rank(catalog, query), [catalog, query])
  const clamped = Math.min(active, Math.max(0, matches.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${clamped}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [clamped])

  const go = (type: string) => {
    onClose()
    navigate({ to: '/r4/$type', params: { type } })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 pt-[18vh] backdrop-blur-[1px] dark:bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to resource"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md overflow-hidden rounded-md border border-line-strong bg-paper shadow-xl shadow-black/20"
      >
        <label className="flex items-center gap-2 border-b border-line px-3 py-2.5 font-mono text-sm">
          <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            name="palette-query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive(Math.min(clamped + 1, matches.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive(Math.max(clamped - 1, 0))
              }
              if (e.key === 'Enter' && matches[clamped]) go(matches[clamped].type)
            }}
            placeholder="Jump to resource…"
            aria-label="Jump to resource"
            className="w-full bg-transparent outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded-sm border border-line px-1 font-mono text-[10px] text-ink-faint">
            esc
          </kbd>
        </label>
        <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {matches.length === 0 && (
            <li className="px-3 py-4 text-center font-mono text-xs text-ink-mid">
              No resource matches “{query}”.
            </li>
          )}
          {matches.map((r, i) => (
            <li key={r.type} data-idx={i}>
              <button
                type="button"
                onClick={() => go(r.type)}
                onPointerEnter={() => {
                  setActive(i)
                  prefetchChunk(r.type)
                }}
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-1 text-left font-mono',
                  i === clamped && 'bg-panel',
                )}
              >
                <span className="shrink-0 text-[13px] font-medium text-flame">{r.type}</span>
                <span className="truncate text-xs text-ink-mid">{r.short}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function rank(catalog: Catalog | undefined, query: string) {
  if (!catalog) return []
  const q = query.trim().toLowerCase()
  if (!q) return catalog.resources.slice(0, 12)
  return catalog.resources
    .map((r) => {
      const name = r.type.toLowerCase()
      let score = -1
      if (name === q) score = 0
      else if (name.startsWith(q)) score = 1
      else if (name.includes(q)) score = 2
      else if (r.short.toLowerCase().includes(q)) score = 3
      return { r, score }
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.r.type.localeCompare(b.r.type))
    .slice(0, 12)
    .map((x) => x.r)
}
