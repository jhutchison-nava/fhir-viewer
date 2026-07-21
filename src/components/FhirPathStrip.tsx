/**
 * TwoSlash-style quickinfo for the FHIRPath expression: one chip per
 * resolved segment showing the type at that step, hover-carded with the
 * same ElementDefCard/TypeCard the schema tree uses.
 */
import { Fragment } from 'react'
import type { Analysis, Segment } from '~/lib/fhirpath-analyzer'
import type { ElementNode } from '~/lib/schema'
import { cn } from '~/lib/cn'
import { HoverCard } from './hover-card/HoverCardBase'
import { ElementDefCard, InteractiveTypeLabel } from './hover-card/cards'

export function FhirPathStrip({ analysis }: { analysis: Analysis | undefined }) {
  if (!analysis?.segments.length) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 px-0.5 font-mono text-xs">
      {analysis.segments.map((segment, i) => (
        <Fragment key={`${segment.start}-${i}`}>
          {i > 0 && (
            <span aria-hidden className="select-none text-ink-faint">
              →
            </span>
          )}
          <SegmentChip segment={segment} />
        </Fragment>
      ))}
    </div>
  )
}

/** Minimal ElementNode for type-label rendering of computed results. */
function pseudoElement(segment: Segment): ElementNode {
  return {
    path: segment.text,
    min: 0,
    max: segment.many ? '*' : '1',
    types: segment.types,
  }
}

function SegmentChip({ segment }: { segment: Segment }) {
  switch (segment.kind) {
    case 'element': {
      const name = (
        <span className={cn('font-medium', segment.many && 'after:text-ink-faint after:content-["[*]"]')}>
          {segment.text}
        </span>
      )
      return (
        <span className="inline-flex items-baseline gap-1 rounded-sm border border-line bg-panel px-1.5 py-0.5">
          {segment.el && segment.chunk ? (
            <HoverCard content={<ElementDefCard chunk={segment.chunk} el={segment.el} />}>
              {name}
            </HoverCard>
          ) : (
            name
          )}
          {segment.types.length > 0 && (
            <InteractiveTypeLabel el={segment.el ?? pseudoElement(segment)} />
          )}
        </span>
      )
    }
    case 'function':
      return (
        <span className="inline-flex items-baseline gap-1 rounded-sm border border-line px-1.5 py-0.5 text-ink-mid">
          {segment.text}
          {segment.types.length > 0 && <InteractiveTypeLabel el={pseudoElement(segment)} />}
        </span>
      )
    case 'literal':
      return <span className="text-t-primitive">{segment.text}</span>
    case 'index':
      return <span className="text-ink-mid">{segment.text}</span>
    case 'operator':
      return <span className="text-ink-mid">{segment.text}</span>
    default:
      return (
        <span className="rounded-sm border border-flame/40 px-1.5 py-0.5 text-flame" title="Unresolved">
          {segment.text}
        </span>
      )
  }
}
