/**
 * The three v1 card types plus the interactive type-label wiring that lets
 * cards nest: type names inside a card body are themselves hover triggers.
 */
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import type { ElementBinding, ElementNode, SchemaChunk } from '~/lib/schema'
import { getChunk, prefetchChunk } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'
import { cn } from '~/lib/cn'
import { TypeLabel, TypeName } from '../TypeLabel'
import { HoverCard } from './HoverCardBase'

// ---------------------------------------------------------------------------
// Interactive wrappers
// ---------------------------------------------------------------------------

/** A type name that opens a TypeCard on hover. */
export function TypeTrigger({ code, className }: { code: string; className?: string }) {
  return (
    <HoverCard content={<TypeCard code={code} />}>
      <TypeName code={code} className={cn('hover:underline', className)} />
    </HoverCard>
  )
}

/** TypeLabel with hover cards on complex types and Reference targets. */
export function InteractiveTypeLabel({ el }: { el: ElementNode }) {
  return (
    <TypeLabel
      el={el}
      wrapType={(code, node) => <HoverCard content={<TypeCard code={code} />}>{node}</HoverCard>}
      wrapReference={(targets, node) => (
        <HoverCard content={<ReferenceTargetsCard targets={targets} />}>{node}</HoverCard>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// TypeCard — a datatype or resource, with its direct elements
// ---------------------------------------------------------------------------

export function TypeCard({ code }: { code: string }) {
  const { data: chunk, error, loading } = useAsync(`chunk:${code}`, () => getChunk(code))
  if (loading) return <CardSkeleton />
  if (error || !chunk) {
    return <p className="px-3 py-2 font-mono text-xs text-ink-mid">No definition for {code}.</p>
  }

  // Direct children only (path depth 2); deeper structure is a hover away.
  const rows = chunk.elements.filter((el) => el.path.split('.').length === 2)

  return (
    <div className="text-[13px]">
      <header className="flex items-baseline gap-2 border-b border-line bg-panel px-3 py-1.5 font-mono">
        {chunk.kind === 'resource' ? (
          <Link
            to="/r4/$type"
            params={{ type: chunk.type }}
            className="font-semibold text-flame hover:underline"
          >
            {chunk.type}
          </Link>
        ) : (
          <span className="font-semibold">{chunk.type}</span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          {chunk.kind.replace('-', ' ')}
        </span>
      </header>
      {chunk.description && (
        <p className="max-w-prose px-3 py-2 font-sans text-xs leading-relaxed text-ink-mid">
          {firstSentence(chunk.description)}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="border-t border-line px-3 py-1.5 font-mono">
          {rows.map((el) => (
            <li key={el.path} className="flex items-baseline gap-1.5 py-px">
              <span className="font-medium">{el.path.split('.')[1]}</span>
              <span className="text-[11px] text-ink-faint">
                {el.min}..{el.max}
              </span>
              <InteractiveTypeLabel el={el} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ElementDefCard — full definition of one element row
// ---------------------------------------------------------------------------

export function ElementDefCard({ chunk, el }: { chunk: SchemaChunk; el: ElementNode }) {
  // Resolve contentReference before rendering (e.g. Questionnaire.item.item
  // is defined by Questionnaire.item).
  const refPath = el.contentRef?.replace(/^#/, '')
  const resolved = refPath ? (chunk.elements.find((e) => e.path === refPath) ?? el) : el

  return (
    <div className="max-w-md text-[13px]">
      <header className="border-b border-line bg-panel px-3 py-1.5 font-mono">
        <span className="font-semibold">{el.path}</span>
        <span className="ml-2 text-[11px] text-ink-faint">
          {resolved.min}..{resolved.max}
        </span>
        {el.isModifier && <span className="ml-2 text-[11px] text-flame">?! modifier</span>}
        {el.isSummary && <span className="ml-2 text-[11px] text-ink-faint">Σ summary</span>}
      </header>
      <div className="space-y-1.5 px-3 py-2">
        {refPath && (
          <p className="font-mono text-[11px] text-ink-faint">contents of {refPath}</p>
        )}
        <p className="font-mono text-xs">
          <InteractiveTypeLabel el={resolved} />
        </p>
        {resolved.choiceOf && (
          <p className="font-mono text-[11px] text-t-choice">
            as {resolved.choiceOf.join(' · ')}
          </p>
        )}
        <p className="font-sans text-xs leading-relaxed text-ink-mid">
          {resolved.definition ?? resolved.short}
        </p>
        {resolved.binding && <BindingLine binding={resolved.binding} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReferenceTargetsCard — where a Reference(...) may point
// ---------------------------------------------------------------------------

export function ReferenceTargetsCard({ targets }: { targets?: string[] }) {
  if (!targets?.length) {
    return (
      <p className="max-w-xs px-3 py-2 font-sans text-xs leading-relaxed text-ink-mid">
        Reference(Any) — may point at a resource of any type.
      </p>
    )
  }
  return (
    <div className="text-[13px]">
      <header className="border-b border-line bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {targets.length} reference target{targets.length === 1 ? '' : 's'}
      </header>
      <ul className="px-3 py-1.5 font-mono">
        {targets.map((target) => (
          <li key={target} className="py-px">
            <HoverCard content={<TypeCard code={target} />}>
              <Link
                to="/r4/$type"
                params={{ type: target }}
                onPointerEnter={() => prefetchChunk(target)}
                className="text-t-reference hover:underline"
              >
                {target}
              </Link>
            </HoverCard>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Binding (static content — expansions are a later phase)
// ---------------------------------------------------------------------------

export function BindingCard({ binding }: { binding: ElementBinding }) {
  return (
    <div className="max-w-xs px-3 py-2 text-xs">
      <p className="font-mono font-medium">{binding.name ?? 'Value set binding'}</p>
      <p className="mt-0.5 text-ink-mid">
        Binding strength: <span className="font-mono">{binding.strength}</span>
      </p>
      {binding.url && (
        <a
          href={binding.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 break-all font-mono text-[11px] text-t-complex hover:underline"
        >
          {binding.url}
          <ExternalLink size={10} className="shrink-0" aria-hidden />
        </a>
      )}
    </div>
  )
}

function BindingLine({ binding }: { binding: ElementBinding }) {
  return (
    <p className="font-mono text-[11px] text-ink-mid">
      binding: {binding.name ?? binding.url?.split('/').pop()}{' '}
      <span className="text-ink-faint">({binding.strength})</span>
      {binding.url && (
        <a
          href={binding.url}
          target="_blank"
          rel="noreferrer"
          className="ml-1 text-t-complex hover:underline"
        >
          ↗
        </a>
      )}
    </p>
  )
}

function CardSkeleton() {
  return (
    <div className="w-64 space-y-2 px-3 py-2.5" aria-busy>
      <div className="h-3 w-24 animate-pulse rounded-sm bg-inset" />
      <div className="h-3 w-full animate-pulse rounded-sm bg-inset" />
      <div className="h-3 w-3/4 animate-pulse rounded-sm bg-inset" />
    </div>
  )
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](?:\s|$)/s)
  return (m ? m[0] : text).trim()
}
