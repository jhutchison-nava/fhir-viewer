import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Combobox } from '@ark-ui/react/combobox'
import { Dialog } from '@ark-ui/react/dialog'
import { Portal } from '@ark-ui/react/portal'
import { createListCollection } from '@ark-ui/react/collection'
import { Search } from 'lucide-react'
import { getCatalog, prefetchChunk, type Catalog, type CatalogResource } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'

/** Cmd-K jump palette over the resource catalog (Ark UI Dialog + Combobox). */
export function SearchPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      aria-label="Jump to resource"
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] dark:bg-black/50" />
        <Dialog.Positioner className="fixed inset-0 z-50 flex justify-center pt-[18vh]">
          <Dialog.Content className="h-fit w-full max-w-md overflow-hidden rounded-md border border-line-strong bg-paper shadow-xl shadow-black/20">
            <Palette onDone={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function Palette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { data: catalog } = useAsync('catalog', getCatalog)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => rank(catalog, query), [catalog, query])
  const collection = useMemo(
    () =>
      createListCollection({
        items: matches,
        itemToValue: (r) => r.type,
        itemToString: (r) => r.type,
      }),
    [matches],
  )

  return (
    <Combobox.Root
      open
      disableLayer
      autoFocus
      inputBehavior="autohighlight"
      selectionBehavior="clear"
      loopFocus={false}
      collection={collection}
      onInputValueChange={(e) => setQuery(e.inputValue)}
      onHighlightChange={(e) => e.highlightedValue && prefetchChunk(e.highlightedValue)}
      onValueChange={(e) => {
        const type = e.value[0]
        if (!type) return
        onDone()
        navigate({ to: '/r4/$type', params: { type } })
      }}
    >
      <Combobox.Control className="flex items-center gap-2 border-b border-line px-3 py-2.5 font-mono text-sm">
        <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
        <Combobox.Input
          name="palette-query"
          placeholder="Jump to resource…"
          className="w-full bg-transparent outline-none placeholder:text-ink-faint"
        />
        <kbd className="rounded-sm border border-line px-1 font-mono text-[10px] text-ink-faint">
          esc
        </kbd>
      </Combobox.Control>
      <Combobox.Content className="max-h-72 overflow-y-auto py-1 outline-none">
        <Combobox.List>
          {matches.length === 0 && (
            <p className="px-3 py-4 text-center font-mono text-xs text-ink-mid">
              No resource matches “{query}”.
            </p>
          )}
          {matches.map((r) => (
            <Combobox.Item
              key={r.type}
              item={r}
              persistFocus
              className="flex w-full cursor-pointer items-baseline gap-2 px-3 py-1 text-left font-mono data-highlighted:bg-panel"
            >
              <span className="shrink-0 text-[13px] font-medium text-flame">{r.type}</span>
              <span className="truncate text-xs text-ink-mid">{r.short}</span>
            </Combobox.Item>
          ))}
        </Combobox.List>
      </Combobox.Content>
    </Combobox.Root>
  )
}

function rank(catalog: Catalog | undefined, query: string): CatalogResource[] {
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
