import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getBacklinks, getResource, prefetchChunk, type Backlink } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'
import { HoverCard } from './hover-card/HoverCardBase'
import { ElementDefCard } from './hover-card/cards'

export function BacklinksPanel({ type }: { type: string }) {
  const { data: index, loading } = useAsync('backlinks', getBacklinks)

  const { direct, bySource } = useMemo(() => {
    const direct = index?.[type] ?? []
    const bySource = new Map<string, Backlink[]>()
    for (const link of direct) {
      let list = bySource.get(link.source)
      if (!list) bySource.set(link.source, (list = []))
      list.push(link)
    }
    return { direct, bySource }
  }, [index, type])

  if (loading) {
    return <p className="py-8 font-mono text-sm text-ink-faint">Loading backlinks…</p>
  }

  const anyRefs = index?.Resource ?? []

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-ink-faint">
        {direct.length} element{direct.length === 1 ? '' : 's'} in {bySource.size} resource
        {bySource.size === 1 ? '' : 's'} declare Reference({type}) — hover a path for its
        definition.
      </p>
      {direct.length === 0 && (
        <p className="font-mono text-sm text-ink-mid">
          Nothing references {type} directly. It may still be reachable through Reference(Any) —
          see below.
        </p>
      )}
      <ul className="columns-1 gap-6 md:columns-2 xl:columns-3">
        {[...bySource.entries()].map(([source, links]) => (
          <li key={source} className="mb-3 break-inside-avoid rounded-sm border border-line">
            <Link
              to="/r4/$type"
              params={{ type: source }}
              onPointerEnter={() => prefetchChunk(source)}
              className="block border-b border-line bg-panel px-2.5 py-1 font-mono text-[13px] font-medium text-flame hover:underline"
            >
              {source}
            </Link>
            <ul className="px-2.5 py-1.5 font-mono text-xs">
              {links.map((link) => (
                <li key={link.path} className="py-px">
                  <HoverCard content={<RemoteElementDefCard link={link} />}>
                    <Link
                      to="/r4/$type"
                      params={{ type: source }}
                      hash={`el-${link.path}`}
                      className="text-t-reference hover:underline"
                    >
                      {link.path}
                    </Link>
                  </HoverCard>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {anyRefs.length > 0 && <AnyRefsSection count={anyRefs.length} links={anyRefs} />}
    </div>
  )
}

/** ElementDefCard for an element that lives in another resource's chunk. */
function RemoteElementDefCard({ link }: { link: Backlink }) {
  const { data: chunk, loading } = useAsync(`chunk:${link.source}`, () => getResource(link.source))
  if (loading || !chunk) {
    return <p className="w-56 px-3 py-2 font-mono text-xs text-ink-faint">Loading…</p>
  }
  const el = chunk.elements.find((e) => e.path === link.path)
  if (!el) {
    return <p className="px-3 py-2 font-mono text-xs text-ink-mid">{link.path} not found.</p>
  }
  return <ElementDefCard chunk={chunk} el={el} />
}

function AnyRefsSection({ count, links }: { count: number; links: Backlink[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 font-mono text-xs text-ink-mid hover:text-ink"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {count} Reference(Any) element{count === 1 ? '' : 's'} can point at any resource type,
        including this one
      </button>
      {open && (
        <ul className="mt-2 columns-1 gap-6 px-1 font-mono text-xs md:columns-2 xl:columns-3">
          {links.map((link) => (
            <li key={link.path} className="py-px">
              <HoverCard content={<RemoteElementDefCard link={link} />}>
                <Link
                  to="/r4/$type"
                  params={{ type: link.source }}
                  hash={`el-${link.path}`}
                  className="text-ink-mid hover:underline"
                >
                  {link.path}
                </Link>
              </HoverCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
