import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getExample, getResource, SchemaNotFoundError, type SchemaChunk } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'
import { ElementTree } from '~/components/ElementTree'
import { JsonTree } from '~/components/JsonTree'
import { cn } from '~/lib/cn'

type Tab = 'schema' | 'example' | 'backlinks'

export const Route = createFileRoute('/r4/$type')({
  validateSearch: (search): { tab?: Tab } => {
    const tab = search.tab
    return tab === 'example' || tab === 'backlinks' ? { tab } : {}
  },
  loader: async ({ params }) => {
    try {
      return await getResource(params.type)
    } catch (err) {
      if (err instanceof SchemaNotFoundError) throw notFound()
      throw err
    }
  },
  notFoundComponent: NotFound,
  component: ResourceDetail,
})

function ResourceDetail() {
  const chunk = Route.useLoaderData()
  const { tab = 'schema' } = Route.useSearch()

  return (
    <div className="py-5">
      <Header chunk={chunk} />
      <TabBar active={tab} />
      {tab === 'schema' && <ElementTree chunk={chunk} />}
      {tab === 'example' && <ExampleView type={chunk.type} />}
      {tab === 'backlinks' && (
        <p className="py-8 font-mono text-sm text-ink-mid">Backlinks land in milestone 6.</p>
      )}
    </div>
  )
}

function ExampleView({ type }: { type: string }) {
  const { data, loading } = useAsync(`example:${type}`, () => getExample(type))
  if (loading) {
    return <p className="py-8 font-mono text-sm text-ink-faint">Loading example…</p>
  }
  if (!data) {
    return (
      <p className="py-8 font-mono text-sm text-ink-mid">
        The R4 package ships no example for {type}. Try the Schema tab instead.
      </p>
    )
  }
  return (
    <>
      <p className="mb-2 font-mono text-xs text-ink-faint">
        Official example <span className="text-ink-mid">{String(data.id ?? '')}</span> — hover a
        node for its FHIRPath, click to copy.
      </p>
      <JsonTree data={data} resourceType={type} />
    </>
  )
}

function Header({ chunk }: { chunk: SchemaChunk }) {
  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <nav aria-label="Breadcrumb" className="font-mono text-xs text-ink-faint">
          <Link to="/" className="hover:text-ink hover:underline">
            r4
          </Link>
          <span> / </span>
        </nav>
        <h1 className="font-mono text-xl font-semibold tracking-tight">{chunk.type}</h1>
        {chunk.base && (
          <span className="font-mono text-xs text-ink-faint">extends {chunk.base}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-ink-mid">
          {chunk.standardsStatus === 'normative' ? (
            <span className="rounded-sm border border-t-primitive/40 px-1.5 py-px text-t-primitive">
              normative
            </span>
          ) : (
            chunk.fmm !== undefined && (
              <span
                className="rounded-sm border border-line px-1.5 py-px"
                title="FHIR Maturity Model level"
              >
                fmm {chunk.fmm}
              </span>
            )
          )}
          <a
            href={`https://hl7.org/fhir/R4/${chunk.type.toLowerCase()}.html`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-line px-1.5 py-px hover:bg-panel"
          >
            spec ↗
          </a>
        </span>
      </div>
      {chunk.description && (
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-mid">
          {chunk.description}
        </p>
      )}
    </header>
  )
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'schema', label: 'Schema' },
  { id: 'example', label: 'Example' },
  { id: 'backlinks', label: 'Backlinks' },
]

function TabBar({ active }: { active: Tab }) {
  return (
    <nav aria-label="Resource views" className="mb-3 flex gap-1 border-b border-line font-mono text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          from={Route.fullPath}
          search={tab.id === 'schema' ? {} : { tab: tab.id }}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-1.5',
            active === tab.id
              ? 'border-flame font-medium text-ink'
              : 'border-transparent text-ink-mid hover:border-line-strong hover:text-ink',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

function NotFound() {
  const { type } = Route.useParams()
  return (
    <div className="py-16 text-center font-mono">
      <p className="text-lg">
        No R4 resource named <span className="font-semibold text-flame">{type}</span>
      </p>
      <p className="mt-2 text-sm text-ink-mid">
        Check the spelling — resource names are case-sensitive.{' '}
        <Link to="/" className="text-t-complex underline">
          Browse all resources
        </Link>
      </p>
    </div>
  )
}
