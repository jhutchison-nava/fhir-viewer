import { Fragment } from 'react'
import type { ElementNode } from '~/lib/schema'
import { cn } from '~/lib/cn'

/** Primitive FHIR types render green and inert; everything else is a complex
 * datatype (blue) or resource reference target (violet). Hover cards attach
 * here in milestone 3. */
const PRIMITIVES = new Set([
  'base64Binary', 'boolean', 'canonical', 'code', 'date', 'dateTime', 'decimal',
  'id', 'instant', 'integer', 'markdown', 'oid', 'positiveInt', 'string',
  'time', 'unsignedInt', 'uri', 'url', 'uuid', 'xhtml',
])

export function isPrimitive(code: string) {
  return PRIMITIVES.has(code)
}

export function TypeLabel({ el }: { el: ElementNode }) {
  if (el.choiceOf?.length) {
    return (
      <span className="text-xs text-t-choice" title={el.types.map((t) => t.code).join(' | ')}>
        {el.types.length} choice{el.types.length === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <span className="min-w-0 truncate text-xs">
      {el.types.map((t, i) => (
        <Fragment key={t.code}>
          {i > 0 && <span className="text-ink-faint"> | </span>}
          {t.code === 'Reference' ? (
            <ReferenceLabel targets={t.targets} />
          ) : (
            <TypeName code={t.code} />
          )}
        </Fragment>
      ))}
    </span>
  )
}

export function TypeName({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn(isPrimitive(code) ? 'text-t-primitive' : 'text-t-complex', className)}>
      {code}
    </span>
  )
}

function ReferenceLabel({ targets }: { targets?: string[] }) {
  return (
    <span className="text-t-reference">
      Reference(
      {targets?.length
        ? targets.map((target, i) => (
            <Fragment key={target}>
              {i > 0 && <span className="text-ink-faint"> | </span>}
              {target}
            </Fragment>
          ))
        : 'Any'}
      )
    </span>
  )
}
