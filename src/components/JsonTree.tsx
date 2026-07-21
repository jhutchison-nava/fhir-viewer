/**
 * Example-instance JSON view. Every node knows its path into the resource;
 * hovering shows the node's FHIRPath in a sticky chip, clicking a key or
 * value copies it. Milestone 5 feeds `highlights` from FHIRPath evaluation.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { pathKey, toFhirPath, type PathSeg } from '~/lib/paths'
import { cn } from '~/lib/cn'

interface TreeCtx {
  resourceType: string
  hovered: readonly PathSeg[] | null
  setHovered: (segs: readonly PathSeg[] | null) => void
  copied: string | null
  copy: (segs: readonly PathSeg[]) => void
  /** pathKey()s of exact matches, plus every ancestor in `highlightTrail`. */
  highlights: ReadonlySet<string>
  highlightTrail: ReadonlySet<string>
}

const Ctx = createContext<TreeCtx | null>(null)

export interface JsonTreeProps {
  data: unknown
  resourceType: string
  /** pathKey()s of nodes to mark as FHIRPath matches. */
  highlights?: ReadonlySet<string>
  /** Also fired on copy-click, e.g. to load the path into the FHIRPath bar. */
  onPathClick?: (segs: readonly PathSeg[]) => void
}

export function JsonTree({ data, resourceType, highlights, onPathClick }: JsonTreeProps) {
  const [hovered, setHovered] = useState<readonly PathSeg[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const highlightTrail = useMemo(() => {
    // Ancestors of matches get a subtle rail so collapsed context is visible.
    const trail = new Set<string>()
    for (const key of highlights ?? []) {
      const segs = key.match(/\.[^.[]+|\[\d+\]/g) ?? []
      for (let i = 0; i < segs.length; i++) trail.add(segs.slice(0, i).join(''))
    }
    return trail
  }, [highlights])

  const ctx: TreeCtx = {
    resourceType,
    hovered,
    setHovered,
    copied,
    copy: (segs) => {
      const path = toFhirPath(resourceType, segs)
      navigator.clipboard?.writeText(path).catch(() => {})
      onPathClick?.(segs)
      setCopied(pathKey(segs))
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1200)
    },
    highlights: highlights ?? new Set(),
    highlightTrail,
  }

  // Scroll the first match into view when highlights change.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!highlights?.size) return
    rootRef.current
      ?.querySelector('[data-match="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlights])

  return (
    <Ctx.Provider value={ctx}>
      <div ref={rootRef} className="relative overflow-x-auto rounded-sm border border-line">
        <PathChip />
        <div
          className="min-w-fit px-3 py-2 font-mono text-[13px] leading-relaxed"
          onMouseLeave={() => setHovered(null)}
        >
          <Node value={data} segs={[]} />
        </div>
      </div>
    </Ctx.Provider>
  )
}

function PathChip() {
  const { resourceType, hovered, copied } = useContext(Ctx)!
  if (!hovered) return null
  const isCopied = copied === pathKey(hovered)
  return (
    <div className="pointer-events-none sticky top-1 z-10 flex h-0 justify-end pr-2">
      <span
        className={cn(
          'rounded-sm border px-1.5 py-0.5 font-mono text-[11px] shadow-sm',
          isCopied
            ? 'border-t-primitive/50 bg-panel text-t-primitive'
            : 'border-line-strong bg-panel text-ink',
        )}
      >
        {isCopied ? 'copied!' : toFhirPath(resourceType, hovered)}
      </span>
    </div>
  )
}

function Node({ value, segs }: { value: unknown; segs: readonly PathSeg[] }) {
  if (Array.isArray(value)) return <Composite value={value} segs={segs} isArray />
  if (value !== null && typeof value === 'object') {
    return <Composite value={value as Record<string, unknown>} segs={segs} isArray={false} />
  }
  return <Primitive value={value} segs={segs} />
}

function Composite({
  value,
  segs,
  isArray,
}: {
  value: Record<string, unknown> | unknown[]
  segs: readonly PathSeg[]
  isArray: boolean
}) {
  const ctx = useContext(Ctx)!
  const [open, setOpen] = useState(true)
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as const)
    : Object.entries(value)
  const brackets = isArray ? '[]' : '{}'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="align-baseline text-ink-faint hover:text-ink"
        aria-label="Expand"
      >
        <ChevronRight size={12} className="mb-px inline" />
        {brackets[0]}…{brackets[1]}
        <span className="ml-1 text-[11px]">
          {entries.length} {isArray ? 'items' : 'fields'}
        </span>
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="align-baseline text-ink-faint hover:text-ink"
        aria-label="Collapse"
      >
        <ChevronDown size={12} className="mb-px inline" />
        {brackets[0]}
      </button>
      <div className="border-l border-line pl-4 hover:border-line-strong">
        {entries.map(([key, child]) => {
          const childSegs = [...segs, key]
          const childKey = pathKey(childSegs)
          const isMatch = ctx.highlights.has(childKey)
          const onTrail = ctx.highlightTrail.has(childKey)
          return (
            <div
              key={key}
              data-match={isMatch || undefined}
              className={cn(
                '-ml-4 pl-4',
                isMatch && 'bg-match outline-1 -outline-offset-1 outline-match-line',
                !isMatch && onTrail && 'border-l-2 border-match-line',
              )}
              onMouseOver={(e) => {
                e.stopPropagation()
                ctx.setHovered(childSegs)
              }}
            >
              <button
                type="button"
                onClick={() => ctx.copy(childSegs)}
                title={`Copy ${toFhirPath(ctx.resourceType, childSegs)}`}
                className={cn(
                  'cursor-copy',
                  isArray ? 'text-ink-faint' : 'font-medium text-t-complex',
                  'hover:underline',
                )}
              >
                {isArray ? `[${key}]` : `"${key}"`}
              </button>
              <span className="text-ink-faint">: </span>
              <Node value={child} segs={childSegs} />
            </div>
          )
        })}
      </div>
      <span className="text-ink-faint">{brackets[1]}</span>
    </>
  )
}

function Primitive({ value, segs }: { value: unknown; segs: readonly PathSeg[] }) {
  const ctx = useContext(Ctx)!
  // Collapse embedded whitespace (xhtml narratives) so lines stay readable.
  const display =
    typeof value === 'string' ? `"${truncate(value.replace(/\s+/g, ' '), 240)}"` : String(value)
  return (
    <button
      type="button"
      onClick={() => ctx.copy(segs)}
      title={`Copy ${toFhirPath(ctx.resourceType, segs)}`}
      className={cn(
        'cursor-copy break-all text-left align-baseline hover:underline',
        typeof value === 'string' && 'text-t-primitive',
        typeof value === 'number' && 'text-t-choice',
        (typeof value === 'boolean' || value === null) && 'text-t-reference',
      )}
    >
      {display}
    </button>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
