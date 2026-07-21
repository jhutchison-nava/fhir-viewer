import { createFileRoute } from '@tanstack/react-router'
import { getResource } from '~/lib/schema'

export const Route = createFileRoute('/r4/$type')({
  loader: ({ params }) => getResource(params.type),
  component: ResourceDetail,
})

function ResourceDetail() {
  const chunk = Route.useLoaderData()
  return (
    <div className="py-6">
      <h1 className="font-mono text-lg font-semibold">{chunk.type}</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-mid">{chunk.description}</p>
      <p className="mt-4 font-mono text-xs text-ink-faint">
        {chunk.elements.length} elements — tree coming in milestone 2
      </p>
    </div>
  )
}
