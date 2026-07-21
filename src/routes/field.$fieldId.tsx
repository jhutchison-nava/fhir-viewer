/** One CMS field: full dictionary semantics + every FHIR mapping. */
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import { getBfdIndex, getBfdOverlay, type BfdAnnotation } from '~/lib/schema'

export const Route = createFileRoute('/field/$fieldId')({
  loader: async ({ params }) => {
    const index = await getBfdIndex()
    const entry = index.entries.find((e) => e.id === Number(params.fieldId))
    if (!entry) throw notFound()
    // The overlay holds the rich per-mapping detail (descriptions, fhirPaths,
    // discriminators); collect this field's annotations across paths.
    const overlay = entry.resource ? await getBfdOverlay(entry.resource) : null
    const mappings: { path: string; annotation: BfdAnnotation }[] = []
    if (overlay) {
      for (const [path, annotations] of Object.entries(overlay)) {
        for (const annotation of annotations) {
          if (annotation.id === entry.id) mappings.push({ path, annotation })
        }
      }
    }
    return { entry, mappings }
  },
  notFoundComponent: () => (
    <p className="py-16 text-center font-mono text-sm text-ink-mid">
      No dictionary field with that id.{' '}
      <Link to="/" className="text-t-complex underline">
        Browse all fields
      </Link>
    </p>
  ),
  component: FieldDetail,
})

function FieldDetail() {
  const { entry, mappings } = Route.useLoaderData()
  const description = mappings[0]?.annotation.description
  return (
    <div className="max-w-4xl py-6">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-faint">
        <Link to="/" className="hover:text-ink hover:underline">
          fields
        </Link>
        <span> / {entry.id}</span>
      </nav>
      <h1 className="mt-1 font-mono text-xl font-semibold tracking-tight">{entry.name}</h1>
      <p className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-xs text-ink-mid">
        {entry.ccw.map((c) => (
          <span key={c} className="rounded-sm border border-line bg-panel px-1.5 py-px">
            {c}
          </span>
        ))}
      </p>
      {description && (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-mid">{description}</p>
      )}

      <p className="mt-4 flex flex-wrap gap-1 font-mono text-[11px]">
        {entry.appliesTo.map((c) => (
          <Link
            key={c}
            to="/claim/$claimType"
            params={{ claimType: c }}
            className="rounded-sm border border-line px-1.5 leading-5 text-ink-mid hover:border-line-strong hover:text-ink"
          >
            {c}
          </Link>
        ))}
        {entry.suppliedIn.filter((s) => s !== 'SyntheticData').map((s) => (
          <Link
            key={s}
            to="/"
            search={{ api: s }}
            className="rounded-sm border border-t-complex/40 px-1.5 leading-5 text-t-complex hover:underline"
          >
            {s}
          </Link>
        ))}
      </p>

      <h2 className="mb-2 mt-8 border-b border-line pb-1 font-mono text-xs font-semibold uppercase tracking-widest text-ink-mid">
        FHIR mappings {mappings.length > 0 && <span className="font-normal text-ink-faint">{mappings.length}</span>}
      </h2>
      {mappings.length === 0 && (
        <p className="font-mono text-sm text-ink-mid">
          This field has no resolvable R4 mapping (see the join report).
        </p>
      )}
      <ul className="space-y-4">
        {mappings.map(({ path, annotation }, i) => (
          <li key={i} className="rounded-sm border border-line p-3 font-mono text-xs">
            <p className="flex flex-wrap items-baseline gap-2">
              <Link
                to="/r4/$type"
                params={{ type: entry.resource }}
                hash={`el-${path}`}
                className="font-medium text-t-complex hover:underline"
              >
                {path}
              </Link>
              {annotation.fhirPath && (
                <Link
                  to="/r4/$type"
                  params={{ type: entry.resource }}
                  search={{ tab: 'example', q: annotation.fhirPath }}
                  className="inline-flex items-center gap-1 text-flame hover:underline"
                >
                  <Play size={10} aria-hidden /> run
                </Link>
              )}
            </p>
            <p className="mt-1 break-all text-[11px] text-ink-faint">source: {annotation.element}</p>
            {annotation.fhirPath && (
              <p className="mt-1 break-all text-[11px] text-t-primitive">{annotation.fhirPath}</p>
            )}
            {annotation.discriminator?.map((d) => (
              <p key={d} className="mt-1 break-all text-[10px] leading-snug text-ink-faint">
                where {d}
              </p>
            ))}
            {annotation.additional && annotation.additional.length > 0 && (
              <details className="mt-1 text-[10px] text-ink-faint">
                <summary className="cursor-pointer select-none">
                  {annotation.additional.length} sibling constant{annotation.additional.length === 1 ? '' : 's'}
                </summary>
                {annotation.additional.map((a) => (
                  <p key={a} className="break-all leading-snug">{a}</p>
                ))}
              </details>
            )}
            {annotation.example && (
              <p className="mt-1 break-all text-[10px] text-ink-mid">e.g. {annotation.example}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
