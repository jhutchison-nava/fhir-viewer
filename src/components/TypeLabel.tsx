import { Fragment, type ReactNode } from 'react'
import type { ElementNode } from '~/lib/schema'
import { cn } from '~/lib/cn'

/** Primitive FHIR types render green; complex datatypes blue; Reference
 * targets violet. Interactivity is injected via the wrap props so this stays
 * decoupled from the hover-card layer (see cards.tsx/InteractiveTypeLabel). */
const PRIMITIVES = new Set([
  'base64Binary', 'boolean', 'canonical', 'code', 'date', 'dateTime', 'decimal',
  'id', 'instant', 'integer', 'markdown', 'oid', 'positiveInt', 'string',
  'time', 'unsignedInt', 'uri', 'url', 'uuid', 'xhtml',
])

export function isPrimitive(code: string) {
  return PRIMITIVES.has(code)
}

interface TypeLabelProps {
  el: ElementNode
  wrapType?: (code: string, node: ReactNode) => ReactNode
  wrapReference?: (targets: string[] | undefined, node: ReactNode) => ReactNode
}

export function TypeLabel({ el, wrapType, wrapReference }: TypeLabelProps) {
  if (el.choiceOf?.length) {
    return (
      <span className="text-xs text-t-choice" title={el.types.map((t) => t.code).join(' | ')}>
        {el.types.length} choice{el.types.length === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <span className="min-w-0 truncate text-xs">
      {el.types.map((t, i) => {
        let node: ReactNode
        if (t.code === 'Reference') {
          node = <ReferenceLabel targets={t.targets} />
          if (wrapReference) node = wrapReference(t.targets, node)
        } else {
          node = <TypeName code={t.code} />
          if (wrapType) node = wrapType(t.code, node)
        }
        return (
          <Fragment key={t.code}>
            {i > 0 && <span className="text-ink-faint"> | </span>}
            {node}
          </Fragment>
        )
      })}
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
