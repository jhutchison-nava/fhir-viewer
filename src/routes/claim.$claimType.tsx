/** One claim type: every dictionary field it carries, arranged by FHIR location. */
import { useMemo } from 'react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getBfdIndex, type BfdIndexEntry } from '~/lib/schema'

export const Route = createFileRoute('/claim/$claimType')({
  loader: async ({ params }) => {
    const index = await getBfdIndex()
    const entries = index.entries.filter((e) => e.appliesTo.includes(params.claimType))
    if (!entries.length) throw notFound()
    return { claimType: params.claimType, entries }
  },
  notFoundComponent: () => (
    <p className="py-16 text-center font-mono text-sm text-ink-mid">
      Unknown claim type.{' '}
      <Link to="/" className="text-t-complex underline">
        Browse all fields
      </Link>
    </p>
  ),
  component: ClaimTypeView,
})

const RESOURCE_ORDER = ['ExplanationOfBenefit', 'Coverage', 'Patient', '']

function ClaimTypeView() {
  const { claimType, entries } = Route.useLoaderData()

  const grouped = useMemo(() => {
    const byResource = new Map<string, Map<string, BfdIndexEntry[]>>()
    for (const e of entries) {
      const resource = e.resource || ''
      let paths = byResource.get(resource)
      if (!paths) byResource.set(resource, (paths = new Map()))
      const key = e.elementPath ?? '(unmapped)'
      let list = paths.get(key)
      if (!list) paths.set(key, (list = []))
      list.push(e)
    }
    return [...byResource.entries()]
      .sort((a, b) => RESOURCE_ORDER.indexOf(a[0]) - RESOURCE_ORDER.indexOf(b[0]))
      .map(([resource, paths]) => [resource, [...paths.entries()].sort((a, b) => a[0].localeCompare(b[0]))] as const)
  }, [entries])

  return (
    <div className="py-6">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-faint">
        <Link to="/" className="hover:text-ink hover:underline">
          fields
        </Link>
        <span> / claim</span>
      </nav>
      <div className="mb-5 mt-1 flex flex-wrap items-baseline gap-x-4">
        <h1 className="font-mono text-xl font-semibold tracking-tight">{claimType}</h1>
        <p className="font-mono text-xs text-ink-faint">
          {entries.length} dictionary fields, by FHIR location
        </p>
      </div>
      <div className="space-y-8">
        {grouped.map(([resource, paths]) => (
          <section key={resource || 'unmapped'}>
            <h2 className="mb-2 border-b border-line pb-1 font-mono text-xs font-semibold uppercase tracking-widest text-ink-mid">
              {resource ? (
                <Link
                  to="/r4/$type"
                  params={{ type: resource }}
                  search={{ bfd: true }}
                  className="hover:text-flame hover:underline"
                >
                  {resource}
                </Link>
              ) : (
                'No FHIR mapping'
              )}
            </h2>
            <ul className="space-y-0.5 font-mono text-xs">
              {paths.map(([path, fields]) => (
                <li key={path} className="flex flex-wrap items-baseline gap-x-2 rounded-sm px-1.5 py-0.5 hover:bg-panel">
                  {path !== '(unmapped)' && resource ? (
                    <Link
                      to="/r4/$type"
                      params={{ type: resource }}
                      hash={`el-${path}`}
                      className="shrink-0 text-t-complex hover:underline"
                    >
                      {path}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-ink-faint">(unmapped)</span>
                  )}
                  <span className="min-w-0 text-ink-mid">
                    {fields.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && <span className="text-ink-faint"> · </span>}
                        <Link
                          to="/field/$fieldId"
                          params={{ fieldId: String(f.id) }}
                          className="hover:text-ink hover:underline"
                        >
                          {f.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
