import { toFhirPath, type PathSeg } from '~/lib/paths'

interface ResultsPanelProps {
  resourceType: string
  results: unknown[]
  resultPaths: (readonly PathSeg[] | undefined)[]
}

export function ResultsPanel({ resourceType, results, resultPaths }: ResultsPanelProps) {
  if (results.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-panel px-3 py-2 font-mono text-xs text-ink-mid">
        Empty collection — the expression matched nothing in this example.
      </p>
    )
  }
  return (
    <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-sm border border-line font-mono text-xs">
      {results.map((result, i) => {
        const path = resultPaths[i]
        return (
          <li key={i} className="flex items-baseline gap-3 px-3 py-1">
            <span className="shrink-0 text-ink-faint">{i}</span>
            <code className="min-w-0 flex-1 truncate">{preview(result)}</code>
            {path && (
              <span className="shrink-0 text-[11px] text-ink-faint">
                {toFhirPath(resourceType, path)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function preview(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  const json = JSON.stringify(value)
  return json && json.length > 160 ? json.slice(0, 160) + '…' : String(json)
}
