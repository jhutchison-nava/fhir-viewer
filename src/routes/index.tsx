/**
 * BFD-first home: the CMS data dictionary as the primary surface.
 * 629 fields, searchable, faceted by claim type and supplying API; every
 * mapped field deep-links to its FHIR element (permalink highlight) and
 * its own field page.
 */
import { useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { getBfdIndex, type BfdIndexEntry } from '~/lib/schema'
import { cn } from '~/lib/cn'

export const Route = createFileRoute('/')({
  validateSearch: (search): { q?: string; claim?: string; api?: string } => ({
    ...(typeof search.q === 'string' && search.q ? { q: search.q } : {}),
    ...(typeof search.claim === 'string' && search.claim ? { claim: search.claim } : {}),
    ...(typeof search.api === 'string' && search.api ? { api: search.api } : {}),
  }),
  loader: () => getBfdIndex(),
  component: BfdHome,
})

const RESOURCE_ORDER = ['ExplanationOfBenefit', 'Coverage', 'Patient', '']

function BfdHome() {
  const index = Route.useLoaderData()
  const { q = '', claim, api } = Route.useSearch()
  const [query, setQuery] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)

  const { claimTypes, apis } = useMemo(() => {
    const claimTypes = new Set<string>()
    const apis = new Set<string>()
    for (const e of index.entries) {
      e.appliesTo.forEach((c) => claimTypes.add(c))
      e.suppliedIn.forEach((s) => s !== 'SyntheticData' && apis.add(s))
    }
    return { claimTypes: [...claimTypes].sort(), apis: [...apis].sort() }
  }, [index])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return index.entries.filter(
      (e) =>
        (!needle ||
          e.name.toLowerCase().includes(needle) ||
          e.ccw.some((c) => c.toLowerCase().includes(needle)) ||
          (e.elementPath ?? '').toLowerCase().includes(needle)) &&
        (!claim || e.appliesTo.includes(claim)) &&
        (!api || e.suppliedIn.includes(api)),
    )
  }, [index, query, claim, api])

  const grouped = useMemo(() => {
    const byResource = new Map<string, BfdIndexEntry[]>()
    for (const e of matches) {
      const key = e.resource || ''
      let list = byResource.get(key)
      if (!list) byResource.set(key, (list = []))
      list.push(e)
    }
    return [...byResource.entries()].sort(
      (a, b) => RESOURCE_ORDER.indexOf(a[0]) - RESOURCE_ORDER.indexOf(b[0]),
    )
  }, [matches])

  return (
    <div className="py-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          CMS data dictionary
        </h1>
        <p className="font-mono text-xs text-ink-faint">
          {matches.length} of {index.entries.length} fields · BFD v{index.version}
        </p>
        <div className="ml-auto w-full max-w-xs">
          <label className="flex items-center gap-2 rounded-sm border border-line bg-panel px-2 py-1.5 font-mono text-sm focus-within:border-line-strong">
            <Search size={14} className="shrink-0 text-ink-faint" aria-hidden />
            <input
              ref={inputRef}
              name="field-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Filter fields, CCW vars, paths…"
              aria-label="Filter fields"
              className="w-full bg-transparent outline-none placeholder:text-ink-faint"
            />
          </label>
        </div>
      </div>

      <div className="mb-5 space-y-1.5 font-mono text-[11px]">
        <FacetRow label="claim" values={claimTypes} active={claim} param="claim" />
        <FacetRow label="api" values={apis} active={api} param="api" />
      </div>

      {grouped.length === 0 && (
        <p className="py-16 text-center font-mono text-sm text-ink-mid">
          No field matches the current filters.
        </p>
      )}

      <div className="space-y-8">
        {grouped.map(([resource, entries]) => (
          <section key={resource || 'unmapped'}>
            <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-1 font-mono text-xs font-semibold uppercase tracking-widest text-ink-mid">
              {resource ? (
                <Link to="/r4/$type" params={{ type: resource }} className="hover:text-flame hover:underline">
                  {resource}
                </Link>
              ) : (
                'No FHIR mapping'
              )}
              <span className="font-normal normal-case tracking-normal text-ink-faint">
                {entries.length}
              </span>
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 xl:grid-cols-2">
              {entries.map((entry) => (
                <FieldRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function FacetRow({
  label,
  values,
  active,
  param,
}: {
  label: string
  values: string[]
  active?: string
  param: 'claim' | 'api'
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-1">
      <span className="w-10 text-ink-faint">{label}</span>
      {values.map((value) => (
        <Link
          key={value}
          from={Route.fullPath}
          search={(prev) => ({ ...prev, [param]: active === value ? undefined : value })}
          className={cn(
            'rounded-sm border px-1.5 leading-5',
            active === value
              ? 'border-flame bg-flame-soft text-flame'
              : 'border-line text-ink-mid hover:border-line-strong hover:text-ink',
          )}
        >
          {value}
        </Link>
      ))}
    </p>
  )
}

function FieldRow({ entry }: { entry: BfdIndexEntry }) {
  return (
    <li>
      <span className="group flex items-baseline gap-2 rounded-sm px-1.5 py-0.5 hover:bg-panel">
        <Link
          to="/field/$fieldId"
          params={{ fieldId: String(entry.id) }}
          className="shrink-0 font-mono text-[13px] font-medium text-flame group-hover:underline"
        >
          {entry.name}
        </Link>
        {entry.ccw.length > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-ink-faint">{entry.ccw[0]}</span>
        )}
        {entry.elementPath ? (
          <Link
            to="/r4/$type"
            params={{ type: entry.resource }}
            hash={`el-${entry.elementPath}`}
            className="min-w-0 truncate font-mono text-xs text-t-complex hover:underline"
          >
            {entry.elementPath}
          </Link>
        ) : (
          <span className="font-mono text-[10px] text-ink-faint">unmapped</span>
        )}
      </span>
    </li>
  )
}
