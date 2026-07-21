import { useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { getCatalog, prefetchChunk, type CatalogResource } from '~/lib/schema'
import { cn } from '~/lib/cn'

export const Route = createFileRoute('/')({
  loader: () => getCatalog(),
  component: Library,
})

const CATEGORY_ORDER = ['Base', 'Clinical', 'Financial', 'Foundation', 'Specialized', 'Other']

function Library() {
  const catalog = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toLowerCase()
  const resources = useMemo(
    () =>
      q
        ? catalog.resources.filter(
            (r) => r.type.toLowerCase().includes(q) || r.short.toLowerCase().includes(q),
          )
        : catalog.resources,
    [catalog, q],
  )

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, CatalogResource[]>>()
    for (const r of resources) {
      let subs = byCategory.get(r.category)
      if (!subs) byCategory.set(r.category, (subs = new Map()))
      let list = subs.get(r.subcategory)
      if (!list) subs.set(r.subcategory, (list = []))
      list.push(r)
    }
    return [...byCategory.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    )
  }, [resources])

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="font-mono text-lg font-semibold tracking-tight">Resource types</h1>
        <p className="font-mono text-xs text-ink-faint">
          {resources.length} of {catalog.resources.length} · FHIR {catalog.fhirVersion}
        </p>
        <div className="ml-auto w-full max-w-xs">
          <label className="flex items-center gap-2 rounded-sm border border-line bg-panel px-2 py-1.5 font-mono text-sm focus-within:border-line-strong">
            <Search size={14} className="shrink-0 text-ink-faint" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder="Filter resources…"
              aria-label="Filter resources"
              className="w-full bg-transparent outline-none placeholder:text-ink-faint"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="text-xs text-ink-faint hover:text-ink"
              >
                clear
              </button>
            )}
          </label>
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="py-16 text-center font-mono text-sm text-ink-mid">
          No resource matches “{query}”. Clear the filter to see all{' '}
          {catalog.resources.length} types.
        </p>
      )}

      <div className="space-y-8">
        {grouped.map(([category, subs]) => (
          <section key={category}>
            <h2 className="mb-2 border-b border-line pb-1 font-mono text-xs font-semibold uppercase tracking-widest text-ink-mid">
              {category}
            </h2>
            <div className="space-y-3">
              {[...subs.entries()].map(([sub, list]) => (
                <div key={sub} className="grid grid-cols-[10rem_1fr] gap-x-4 max-sm:grid-cols-1">
                  <h3 className="pt-1 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    {sub}
                  </h3>
                  <ul className="grid grid-cols-2 gap-x-6 max-lg:grid-cols-1">
                    {list.map((r) => (
                      <ResourceRow key={r.type} resource={r} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ResourceRow({ resource }: { resource: CatalogResource }) {
  return (
    <li>
      <Link
        to="/r4/$type"
        params={{ type: resource.type }}
        onPointerEnter={() => prefetchChunk(resource.type)}
        className="group flex items-baseline gap-2 rounded-sm px-1.5 py-0.5 hover:bg-panel"
      >
        <span className="shrink-0 font-mono text-[13px] font-medium text-flame group-hover:underline">
          {resource.type}
        </span>
        {resource.fmm !== undefined && (
          <span
            title={`Maturity level ${resource.fmm}`}
            className={cn(
              'shrink-0 rounded-sm border border-line px-1 font-mono text-[10px] leading-4 text-ink-faint',
              resource.standardsStatus === 'normative' && 'border-t-primitive/40 text-t-primitive',
            )}
          >
            {resource.standardsStatus === 'normative' ? 'N' : resource.fmm}
          </span>
        )}
        <span className="truncate text-xs text-ink-mid">{resource.short}</span>
      </Link>
    </li>
  )
}
