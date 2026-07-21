/**
 * Hover-card body for BFD data-dictionary annotations on an element:
 * the CMS field semantics (CCW lineage, claim types, supplying APIs) plus
 * a one-click "run ▸" that loads the field's FHIRPath into the bar.
 */
import { Link } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import type { BfdAnnotation } from '~/lib/schema'

export function BfdCard({
  resourceType,
  annotations,
}: {
  resourceType: string
  annotations: BfdAnnotation[]
}) {
  return (
    <div className="max-w-md text-xs">
      <header className="border-b border-line bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        BFD data dictionary · {annotations.length} field{annotations.length === 1 ? '' : 's'}
      </header>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
        {annotations.map((a) => (
          <li key={`${a.id}-${a.element}`} className="space-y-1 px-3 py-2">
            <p className="flex items-baseline gap-2 font-mono">
              <span className="font-semibold">{a.name}</span>
              {a.ccw.length > 0 && <span className="text-ink-faint">{a.ccw.join(', ')}</span>}
              {a.fhirPath && (
                <Link
                  to="/r4/$type"
                  params={{ type: resourceType }}
                  search={{ tab: 'example', q: a.fhirPath }}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 text-flame hover:underline"
                  title="Load this field's FHIRPath into the expression bar"
                >
                  <Play size={10} aria-hidden /> run
                </Link>
              )}
            </p>
            <p className="font-sans leading-relaxed text-ink-mid">{a.description}</p>
            <p className="flex flex-wrap gap-1">
              {a.appliesTo.map((c) => (
                <span key={c} className="rounded-sm border border-line bg-panel px-1 font-mono text-[10px] leading-4 text-ink-mid">
                  {c}
                </span>
              ))}
              {a.suppliedIn.filter((s) => s !== 'SyntheticData').map((s) => (
                <span key={s} className="rounded-sm border border-t-complex/40 px-1 font-mono text-[10px] leading-4 text-t-complex">
                  {s}
                </span>
              ))}
            </p>
            {a.discriminator?.map((d) => (
              <p key={d} className="break-all font-mono text-[10px] leading-snug text-ink-faint">
                where {d}
              </p>
            ))}
            {a.example && (
              <p className="break-all font-mono text-[10px] text-t-primitive">e.g. {a.example}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
