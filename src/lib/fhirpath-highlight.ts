/**
 * Map FHIRPath evaluation results back onto source locations in the example
 * instance, so the JsonTree can highlight matched nodes.
 *
 * Mechanism: `annotate` deep-clones the resource, tagging every object and
 * array with a non-enumerable Symbol recording its path segments. fhirpath.js
 * passes objects through by reference, so object results still carry the tag.
 * Primitive results carry no tag; for those we drop the trailing path segment
 * from the expression, evaluate the truncated expression to find the tagged
 * parent objects, and mark parent + lastSegment (conservative parent-level
 * highlight when even that fails).
 */
import { pathKey, type PathSeg } from './paths'
import { evaluate } from './fhirpath'

const PATH = Symbol('fhirpath-explorer-path')

interface Tagged {
  [PATH]?: readonly PathSeg[]
}

export function annotate<T>(value: T, segs: readonly PathSeg[] = []): T {
  if (Array.isArray(value)) {
    const out = value.map((item, i) => annotate(item, [...segs, i]))
    Object.defineProperty(out, PATH, { value: segs })
    return out as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = annotate(child, [...segs, key])
    }
    Object.defineProperty(out, PATH, { value: segs })
    return out as T
  }
  return value
}

function getTag(value: unknown): readonly PathSeg[] | undefined {
  if (value !== null && typeof value === 'object') return (value as Tagged)[PATH]
  return undefined
}

export interface EvalOutcome {
  results: unknown[]
  /** pathKey()s of matched nodes in the annotated resource. */
  highlightKeys: Set<string>
  /** Paths aligned with results (undefined where unresolvable). */
  resultPaths: (readonly PathSeg[] | undefined)[]
}

/** Trailing `.identifier` or `.identifier[n]` of an expression, if any. */
const TAIL = /^(.+)\.([A-Za-z_]\w*)(\[(\d+)\])?\s*$/s
/** A whole-expression bare identifier, e.g. `birthDate` or `given[0]`. */
const BARE = /^([A-Za-z_]\w*)(\[(\d+)\])?\s*$/

/** Resolve prop against a parent, tolerating choice-type suffixes:
 * `deceased` matches `deceasedBoolean` when the bare name is absent. */
function resolveProp(record: Record<string, unknown>, prop: string): string | undefined {
  if (record[prop] !== undefined) return prop
  const choices = Object.keys(record).filter(
    (k) => k.startsWith(prop) && /^[A-Z]/.test(k.slice(prop.length)),
  )
  return choices.length === 1 ? choices[0] : undefined
}

export function evaluateWithHighlights(annotated: unknown, expression: string): EvalOutcome {
  const results = evaluate(annotated, expression)
  const highlightKeys = new Set<string>()
  const resultPaths: (readonly PathSeg[] | undefined)[] = results.map((r) => getTag(r))

  for (const path of resultPaths) {
    if (path) highlightKeys.add(pathKey(path))
  }

  // Primitive results: resolve via the truncated parent expression.
  const unresolved = results.filter((_, i) => !resultPaths[i])
  if (unresolved.length > 0) {
    let parentExpr: string | undefined
    let prop: string | undefined
    let index: string | undefined
    const tail = expression.match(TAIL)
    const bare = expression.match(BARE)
    if (tail) [, parentExpr, prop, , index] = tail
    else if (bare) [, prop, , index] = bare

    if (prop) {
      let parents: unknown[] = []
      try {
        // Bare identifier: the parent is the resource root itself.
        parents = parentExpr ? evaluate(annotated, parentExpr) : [annotated]
      } catch {
        // parent expression alone may be invalid (e.g. dangling operators)
      }
      for (const parent of parents) {
        const parentPath = getTag(parent)
        if (!parentPath) continue
        const record = parent as Record<string, unknown>
        const key = resolveProp(record, prop)
        if (!key) continue
        const value = record[key]
        if (index !== undefined && Array.isArray(value)) {
          highlightKeys.add(pathKey([...parentPath, key, Number(index)]))
        } else {
          highlightKeys.add(pathKey([...parentPath, key]))
          // Array props: also mark each item so every matched value lights up.
          if (Array.isArray(value)) {
            value.forEach((_, i) => highlightKeys.add(pathKey([...parentPath, key, i])))
          }
        }
      }
      // Fill resultPaths for display where the mapping is unambiguous.
      if (parents.length === 1) {
        const parentPath = getTag(parents[0])
        const key = parentPath && resolveProp(parents[0] as Record<string, unknown>, prop)
        if (parentPath && key) {
          results.forEach((r, i) => {
            if (!resultPaths[i] && (typeof r !== 'object' || r === null)) {
              resultPaths[i] =
                index !== undefined ? [...parentPath, key, Number(index)] : [...parentPath, key]
            }
          })
        }
      }
    }
  }

  return { results, highlightKeys, resultPaths }
}
