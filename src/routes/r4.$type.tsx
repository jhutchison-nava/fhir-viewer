import { useCallback, useMemo } from 'react'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { Tabs } from '@ark-ui/react/tabs'
import { getExample, getResource, SchemaNotFoundError, type SchemaChunk } from '~/lib/schema'
import { useAsync } from '~/lib/use-async'
import { annotate, evaluateWithHighlights, type EvalOutcome } from '~/lib/fhirpath-highlight'
import { toFhirPath, type PathSeg } from '~/lib/paths'
import { ElementTree } from '~/components/ElementTree'
import { JsonTree } from '~/components/JsonTree'
import { FhirPathBar } from '~/components/FhirPathBar'
import { ResultsPanel } from '~/components/ResultsPanel'
import { BacklinksPanel } from '~/components/BacklinksPanel'

type Tab = 'schema' | 'example' | 'backlinks'

export const Route = createFileRoute('/r4/$type')({
  validateSearch: (search): { tab?: Tab; q?: string } => {
    const tab = search.tab
    const q = typeof search.q === 'string' && search.q ? search.q : undefined
    return {
      ...(tab === 'example' || tab === 'backlinks' ? { tab } : {}),
      ...(q ? { q } : {}),
    }
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
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div className="py-5">
      <Header chunk={chunk} />
      <Tabs.Root
        value={tab}
        lazyMount
        // Pointer clicks navigate through the Links below (URL-first); this
        // handler makes arrow-key tab switching navigate too. Same-URL
        // navigation after a click is a no-op.
        onValueChange={({ value }) =>
          navigate({ search: value === 'schema' ? {} : { tab: value as Tab } })
        }
      >
        <Tabs.List className="mb-3 flex gap-1 border-b border-line font-mono text-sm">
          {TABS.map(({ id, label }) => (
            <Tabs.Trigger key={id} value={id} asChild>
              <Link
                from={Route.fullPath}
                search={id === 'schema' ? {} : { tab: id }}
                className="-mb-px border-b-2 border-transparent px-3 py-1.5 text-ink-mid hover:border-line-strong hover:text-ink data-selected:border-flame data-selected:font-medium data-selected:text-ink"
              >
                {label}
              </Link>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {/* lazyMount without unmountOnExit: hidden views keep their state
            (tree expansion, JSON collapse) when switching back. */}
        <Tabs.Content value="schema" className="outline-none">
          <ElementTree chunk={chunk} />
        </Tabs.Content>
        <Tabs.Content value="example" className="outline-none">
          <ExampleView type={chunk.type} />
        </Tabs.Content>
        <Tabs.Content value="backlinks" className="outline-none">
          <BacklinksPanel type={chunk.type} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

function ExampleView({ type }: { type: string }) {
  const { q = '' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data, loading } = useAsync(`example:${type}`, () => getExample(type))

  const setQuery = useCallback(
    (expression: string) =>
      navigate({
        search: (prev) => ({ ...prev, q: expression || undefined }),
        replace: true,
      }),
    [navigate],
  )

  const annotated = useMemo(() => (data ? annotate(data) : null), [data])

  const evaluation = useMemo<{ outcome?: EvalOutcome; error?: string }>(() => {
    if (!annotated || !q) return {}
    try {
      return { outcome: evaluateWithHighlights(annotated, q) }
    } catch (err) {
      return { error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
    }
  }, [annotated, q])

  const onPathClick = useCallback(
    (segs: readonly PathSeg[]) => setQuery(toFhirPath(type, segs)),
    [setQuery, type],
  )

  if (loading) {
    return <p className="py-8 font-mono text-sm text-ink-faint">Loading example…</p>
  }
  if (!data || !annotated) {
    return (
      <p className="py-8 font-mono text-sm text-ink-mid">
        The R4 package ships no example for {type}. Try the Schema tab instead.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <FhirPathBar
        value={q}
        onChange={setQuery}
        error={evaluation.error}
        resultCount={evaluation.outcome?.results.length}
      />
      {evaluation.outcome && (
        <ResultsPanel
          resourceType={type}
          results={evaluation.outcome.results}
          resultPaths={evaluation.outcome.resultPaths}
        />
      )}
      <p className="font-mono text-xs text-ink-faint">
        Official example <span className="text-ink-mid">{String(data.id ?? '')}</span> — hover a
        node for its FHIRPath, click to copy it and load it into the bar.
      </p>
      <JsonTree
        data={annotated}
        resourceType={type}
        highlights={evaluation.outcome?.highlightKeys}
        onPathClick={onPathClick}
      />
    </div>
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
