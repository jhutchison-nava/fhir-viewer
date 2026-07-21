/**
 * TwoSlash-style static analysis for FHIRPath expressions.
 *
 * Walks fhirpath.js's parse AST (every identifier node carries text/start/
 * length) and threads the FHIR type through each step using the distilled
 * schema chunks. Produces:
 *  - segments: the resolved top-level chain (element, function, index,
 *    literal, operator) with the type(s) at each step — quickinfo material
 *  - diagnostics: spans + messages the runtime never surfaces, e.g.
 *    "no element 'nmae' on Patient — did you mean name?"
 *
 * Unknown constructs degrade to kind 'unknown' — the analyzer never throws
 * except by returning a parse diagnostic.
 */
import fhirpath from 'fhirpath'
import { getChunk } from './schema'
import type { ElementNode, ElementType, SchemaChunk } from './schema-types'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type SegmentKind = 'element' | 'function' | 'index' | 'literal' | 'operator' | 'unknown'

export interface Segment {
  text: string
  /** 0-based character offset into the expression. */
  start: number
  length: number
  kind: SegmentKind
  /** Result type(s) after this step (empty when unknown). */
  types: ElementType[]
  /** Present for element segments: the matched ElementDefinition + its chunk. */
  el?: ElementNode
  chunk?: SchemaChunk
  many: boolean
}

export interface Diagnostic {
  start: number
  length: number
  message: string
  severity: 'error' | 'warning'
  didYouMean?: string
}

export interface Analysis {
  segments: Segment[]
  diagnostics: Diagnostic[]
}

export interface Completion {
  name: string
  kind: 'element' | 'function'
  types: ElementType[]
  short?: string
  /** For functions: whether the parens take arguments (caret goes inside). */
  hasParams?: boolean
}

// ---------------------------------------------------------------------------
// Type state
// ---------------------------------------------------------------------------

/** Where we are in the type system: a named type, or a backbone position
 * inside a chunk (e.g. Patient.contact), or off the map. */
type TypeState =
  | { kind: 'chunk'; code: string }
  | { kind: 'backbone'; chunk: SchemaChunk; path: string }
  | { kind: 'unknown' }

interface Resolved {
  states: TypeState[]
  many: boolean
}

const UNKNOWN: Resolved = { states: [{ kind: 'unknown' }], many: true }

function displayTypes(states: TypeState[]): ElementType[] {
  const out: ElementType[] = []
  for (const state of states) {
    if (state.kind === 'chunk') out.push({ code: state.code })
    else if (state.kind === 'backbone') out.push({ code: 'BackboneElement' })
  }
  return out
}

function allUnknown(resolved: Resolved): boolean {
  return resolved.states.every((s) => s.kind === 'unknown')
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

interface AstNode {
  type: string
  text?: string
  start?: { line: number; column: number }
  length?: number
  children?: AstNode[]
}

function span(node: AstNode): { start: number; length: number } {
  return { start: (node.start?.column ?? 1) - 1, length: node.length ?? 0 }
}

function identifierText(node: AstNode): string {
  // MemberInvocation/Identifier text; strips `backtick` quoting
  return (node.text ?? '').replace(/^`|`$/g, '')
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export async function analyze(resourceType: string, expression: string): Promise<Analysis> {
  const segments: Segment[] = []
  const diagnostics: Diagnostic[] = []

  let ast: AstNode
  try {
    ast = fhirpath.parse(expression) as AstNode
  } catch (err) {
    // fhirpath.js error shape: "line: 1; column: 11; message: mismatched
    // input '<EOF>' expecting {...}" — keep the message, drop the token dump.
    const raw = err instanceof Error ? err.message : String(err)
    const m = raw.match(/line:?\s*(\d+)[;,]?\s*col(?:umn)?:?\s*(\d+)/i)
    const start = m ? Math.max(0, Number(m[2]) - 1) : 0
    const message = (raw.match(/message:\s*([^]*)/)?.[1] ?? raw).split(' expecting ')[0].split('\n')[0].trim()
    diagnostics.push({
      start,
      length: Math.max(1, expression.length - start),
      message: `parse error: ${message}`,
      severity: 'error',
    })
    return { segments, diagnostics }
  }

  const root: Resolved = { states: [{ kind: 'chunk', code: resourceType }], many: false }

  async function childElements(state: TypeState): Promise<{ els: ElementNode[]; chunk: SchemaChunk } | null> {
    if (state.kind === 'unknown') return null
    try {
      if (state.kind === 'chunk') {
        const chunk = await getChunk(state.code)
        return {
          chunk,
          els: chunk.elements.filter((el) => el.path.split('.').length === 2),
        }
      }
      const depth = state.path.split('.').length + 1
      return {
        chunk: state.chunk,
        els: state.chunk.elements.filter(
          (el) => el.path.startsWith(state.path + '.') && el.path.split('.').length === depth,
        ),
      }
    } catch {
      return null // chunk fetch failed (unknown type name)
    }
  }

  function statesFromElement(el: ElementNode, chunk: SchemaChunk): TypeState[] {
    if (el.contentRef) {
      return [{ kind: 'backbone', chunk, path: el.contentRef.replace(/^#/, '') }]
    }
    const isBackbone = el.types.length === 1 && (el.types[0].code === 'BackboneElement' || el.types[0].code === 'Element')
    if (isBackbone) return [{ kind: 'backbone', chunk, path: el.path }]
    return el.types.map((t) => ({ kind: 'chunk' as const, code: t.code }))
  }

  /** Look up `name` as a member across a union of states. */
  async function lookupMember(
    name: string,
    on: Resolved,
  ): Promise<{ el: ElementNode; chunk: SchemaChunk } | { candidates: string[] } | null> {
    if (allUnknown(on)) return null
    const candidates: string[] = []
    for (const state of on.states) {
      const kids = await childElements(state)
      if (!kids) continue
      for (const el of kids.els) {
        const last = el.path.split('.').pop()!
        const stem = last.endsWith('[x]') ? last.slice(0, -3) : last
        candidates.push(stem)
        if (stem === name) return { el, chunk: kids.chunk }
      }
    }
    return { candidates }
  }

  function emit(segment: Segment, topLevel: boolean) {
    if (topLevel) segments.push(segment)
  }

  /** Resolve an expression node. `scope` is the current context ($this);
   * `chain` is what a leading member/step applies to (the running pipeline).
   * topLevel controls segment emission (function params are diagnostics-only). */
  async function resolve(node: AstNode, scope: Resolved, chain: Resolved, topLevel: boolean): Promise<Resolved> {
    switch (node.type) {
      case 'EntireExpression':
      case 'TermExpression':
      case 'InvocationTerm':
      case 'ParenthesizedTerm':
        return node.children?.length
          ? resolve(node.children[node.children.length - 1], scope, chain, topLevel)
          : chain

      case 'InvocationExpression': {
        const [left, invocation] = node.children!
        const l = await resolve(left, scope, chain, topLevel)
        return applyInvocation(invocation, scope, l, topLevel)
      }

      case 'MemberInvocation':
        return applyInvocation(node, scope, chain, topLevel)

      case 'FunctionInvocation':
        return applyInvocation(node, scope, chain, topLevel)

      case 'IndexerExpression': {
        const [target, index] = node.children!
        const t = await resolve(target, scope, chain, topLevel)
        await resolve(index, scope, root, false) // diagnostics only
        emit({ text: node.text ?? '[…]', ...span(node), kind: 'index', types: displayTypes(t.states), many: false }, topLevel)
        return { states: t.states, many: false }
      }

      case 'UnionExpression': {
        const [a, b] = node.children!
        const ra = await resolve(a, scope, chain, topLevel)
        emit({ text: '|', ...span(node), kind: 'operator', types: [], many: true }, topLevel)
        const rb = await resolve(b, scope, chain, topLevel)
        return { states: [...ra.states, ...rb.states], many: true }
      }

      case 'EqualityExpression':
      case 'InequalityExpression':
      case 'MembershipExpression':
      case 'AndExpression':
      case 'OrExpression':
      case 'XorExpression':
      case 'ImpliesExpression': {
        const [a, b] = node.children!
        await resolve(a, scope, chain, topLevel)
        emit({ text: node.text ?? '', ...span(node), kind: 'operator', types: [{ code: 'boolean' }], many: false }, topLevel)
        await resolve(b, scope, chain, topLevel)
        return { states: [{ kind: 'chunk', code: 'boolean' }], many: false }
      }

      case 'AdditiveExpression':
      case 'MultiplicativeExpression': {
        for (const child of node.children ?? []) await resolve(child, scope, chain, topLevel)
        emit({ text: node.text ?? '', ...span(node), kind: 'operator', types: [], many: false }, topLevel)
        return UNKNOWN
      }

      case 'PolarityExpression':
      case 'TypeExpression': // `x is T` / `x as T`
        return node.children?.length ? resolve(node.children[0], scope, chain, topLevel) : UNKNOWN

      case 'LiteralTerm': {
        const child = node.children?.[0]
        const code =
          child?.type === 'StringLiteral' ? 'string'
          : child?.type === 'NumberLiteral' ? 'decimal'
          : child?.type === 'BooleanLiteral' ? 'boolean'
          : child?.type?.replace('Literal', '').toLowerCase() ?? 'unknown'
        emit({ text: node.text ?? '', ...span(node), kind: 'literal', types: [{ code }], many: false }, topLevel)
        return { states: [{ kind: 'chunk', code }], many: false }
      }

      case 'ExternalConstantTerm':
        return root // %resource / %context approximation

      case 'ThisInvocation':
        return scope

      case 'IndexInvocation':
      case 'TotalInvocation':
        return { states: [{ kind: 'chunk', code: 'integer' }], many: false }

      default:
        for (const child of node.children ?? []) await resolve(child, scope, chain, topLevel)
        return UNKNOWN
    }
  }

  async function applyInvocation(node: AstNode, scope: Resolved, chain: Resolved, topLevel: boolean): Promise<Resolved> {
    if (node.type === 'MemberInvocation') {
      const name = identifierText(node)
      // Leading resource-type segment: `Patient.name` — consume as the root.
      const isRootName =
        chain === root && name === resourceType
      if (isRootName) {
        emit({ text: name, ...span(node), kind: 'element', types: [{ code: resourceType }], many: false }, topLevel)
        return { states: [{ kind: 'chunk', code: resourceType }], many: false }
      }
      const hit = await lookupMember(name, chain)
      if (hit && 'el' in hit) {
        const many = chain.many || hit.el.max === '*'
        const states = statesFromElement(hit.el, hit.chunk)
        // contentRef elements carry no types of their own — show the target's.
        const types = hit.el.types.length ? hit.el.types : displayTypes(states)
        emit(
          { text: name, ...span(node), kind: 'element', types, el: hit.el, chunk: hit.chunk, many },
          topLevel,
        )
        return { states, many }
      }
      if (hit && 'candidates' in hit) {
        const suggestion = didYouMean(name, hit.candidates)
        const owner = displayTypes(chain.states).map((t) => t.code).join(' | ') || 'this type'
        diagnostics.push({
          ...span(node),
          message: `no element '${name}' on ${owner}`,
          severity: 'error',
          didYouMean: suggestion,
        })
      }
      emit({ text: name, ...span(node), kind: 'unknown', types: [], many: chain.many }, topLevel)
      return UNKNOWN
    }

    // FunctionInvocation
    const functn = node.children?.[0]
    const name = identifierText(functn?.children?.[0] ?? node)
    const params = functn?.children?.find((c) => c.type === 'ParamList')?.children ?? []
    const item: Resolved = { states: chain.states, many: false } // $this inside scoped params

    const finish = (result: Resolved): Resolved => {
      emit(
        { text: `${name}(${params.length ? '…' : ''})`, ...span(node), kind: 'function', types: displayTypes(result.states), many: result.many },
        topLevel,
      )
      return result
    }

    switch (name) {
      // identity, collection-preserving
      case 'where': case 'distinct': case 'trace': case 'intersect': case 'exclude':
      case 'tail': case 'take': case 'skip':
        for (const p of params) await resolve(p, item, item, false)
        return finish({ states: chain.states, many: true })
      case 'union': case 'combine': {
        let states = [...chain.states]
        for (const p of params) {
          const r = await resolve(p, scope, root, false)
          states = [...states, ...r.states]
        }
        return finish({ states, many: true })
      }
      // identity, single item
      case 'first': case 'last': case 'single':
        return finish({ states: chain.states, many: false })
      // scoped projection
      case 'select': case 'repeat': {
        let result: Resolved = UNKNOWN
        for (const p of params) result = await resolve(p, item, item, false)
        return finish({ states: result.states, many: true })
      }
      // booleans
      case 'exists': case 'all':
        for (const p of params) await resolve(p, item, item, false)
        return finish({ states: [{ kind: 'chunk', code: 'boolean' }], many: false })
      case 'empty': case 'hasValue': case 'allTrue': case 'anyTrue': case 'allFalse': case 'anyFalse':
      case 'not': case 'isDistinct': case 'memberOf': case 'subsetOf': case 'supersetOf':
      case 'matches': case 'startsWith': case 'endsWith': case 'contains': case 'conformsTo':
      case 'is': case 'hasTemplateIdOf':
        for (const p of params) await resolve(p, scope, root, false)
        return finish({ states: [{ kind: 'chunk', code: 'boolean' }], many: false })
      // numbers
      case 'count': case 'length': case 'indexOf': case 'toInteger':
        for (const p of params) await resolve(p, scope, root, false)
        return finish({ states: [{ kind: 'chunk', code: 'integer' }], many: false })
      case 'toDecimal':
        return finish({ states: [{ kind: 'chunk', code: 'decimal' }], many: false })
      // strings
      case 'join': case 'toString': case 'substring': case 'replace': case 'lower': case 'upper':
      case 'trim': case 'encode': case 'decode': case 'replaceMatches':
        for (const p of params) await resolve(p, scope, root, false)
        return finish({ states: [{ kind: 'chunk', code: 'string' }], many: false })
      case 'split': case 'toChars':
        for (const p of params) await resolve(p, scope, root, false)
        return finish({ states: [{ kind: 'chunk', code: 'string' }], many: true })
      // casts
      case 'ofType': case 'as': {
        const typeName = params[0] ? extractTypeName(params[0]) : null
        return finish(
          typeName
            ? { states: [{ kind: 'chunk', code: typeName }], many: name === 'ofType' ? chain.many : false }
            : UNKNOWN,
        )
      }
      // typed escapes
      case 'extension':
        for (const p of params) await resolve(p, scope, root, false)
        return finish({ states: [{ kind: 'chunk', code: 'Extension' }], many: true })
      case 'iif': {
        await resolve(params[0], item, item, false)
        const a = params[1] ? await resolve(params[1], scope, root, false) : UNKNOWN
        const b = params[2] ? await resolve(params[2], scope, root, false) : { states: [], many: false }
        return finish({ states: [...a.states, ...b.states], many: a.many || b.many })
      }
      case 'toQuantity':
        return finish({ states: [{ kind: 'chunk', code: 'Quantity' }], many: false })
      case 'toDate':
        return finish({ states: [{ kind: 'chunk', code: 'date' }], many: false })
      case 'toDateTime':
        return finish({ states: [{ kind: 'chunk', code: 'dateTime' }], many: false })
      case 'toTime':
        return finish({ states: [{ kind: 'chunk', code: 'time' }], many: false })
      case 'toBoolean':
        return finish({ states: [{ kind: 'chunk', code: 'boolean' }], many: false })
      // off the map
      case 'children': case 'descendants': case 'resolve': case 'aggregate':
        for (const p of params) await resolve(p, item, item, false)
        return finish(UNKNOWN)
      default:
        for (const p of params) await resolve(p, item, item, false)
        diagnostics.push({
          ...span(node),
          message: `unknown function '${name}'`,
          severity: 'warning',
        })
        return finish(UNKNOWN)
    }
  }

  function extractTypeName(param: AstNode): string | null {
    // ofType(Quantity) → TermExpression > InvocationTerm > MemberInvocation
    let node: AstNode | undefined = param
    while (node && node.type !== 'MemberInvocation' && node.type !== 'Identifier') {
      node = node.children?.[node.children.length - 1]
    }
    return node ? identifierText(node) : null
  }

  const final = await resolve(ast, root, root, true)
  segments.sort((a, b) => a.start - b.start)
  const analysis: Analysis = { segments, diagnostics }
  FINALS.set(analysis, { final, childElements })
  return analysis
}

// ---------------------------------------------------------------------------
// Completions (TwoSlash ^| equivalent)
// ---------------------------------------------------------------------------

/** Opaque per-analysis resolver state, for suggest(). */
const FINALS = new WeakMap<
  Analysis,
  {
    final: Resolved
    childElements: (state: TypeState) => Promise<{ els: ElementNode[]; chunk: SchemaChunk } | null>
  }
>()

export const FHIRPATH_FUNCTIONS: Completion[] = [
  { name: 'where', kind: 'function', types: [], short: 'filter by criteria', hasParams: true },
  { name: 'exists', kind: 'function', types: [{ code: 'boolean' }], short: 'any items (optionally matching)?', hasParams: true },
  { name: 'empty', kind: 'function', types: [{ code: 'boolean' }], short: 'no items?' },
  { name: 'first', kind: 'function', types: [], short: 'first item' },
  { name: 'last', kind: 'function', types: [], short: 'last item' },
  { name: 'single', kind: 'function', types: [], short: 'sole item (error if more)' },
  { name: 'count', kind: 'function', types: [{ code: 'integer' }], short: 'number of items' },
  { name: 'distinct', kind: 'function', types: [], short: 'unique items' },
  { name: 'select', kind: 'function', types: [], short: 'project each item', hasParams: true },
  { name: 'ofType', kind: 'function', types: [], short: 'keep items of a type', hasParams: true },
  { name: 'as', kind: 'function', types: [], short: 'cast to a type', hasParams: true },
  { name: 'extension', kind: 'function', types: [{ code: 'Extension' }], short: 'extensions by url', hasParams: true },
  { name: 'resolve', kind: 'function', types: [], short: 'follow references' },
  { name: 'memberOf', kind: 'function', types: [{ code: 'boolean' }], short: 'in value set?', hasParams: true },
  { name: 'matches', kind: 'function', types: [{ code: 'boolean' }], short: 'regex match', hasParams: true },
  { name: 'startsWith', kind: 'function', types: [{ code: 'boolean' }], short: 'string prefix?', hasParams: true },
  { name: 'contains', kind: 'function', types: [{ code: 'boolean' }], short: 'substring?', hasParams: true },
  { name: 'join', kind: 'function', types: [{ code: 'string' }], short: 'concatenate with separator', hasParams: true },
  { name: 'toString', kind: 'function', types: [{ code: 'string' }], short: 'convert to string' },
  { name: 'toInteger', kind: 'function', types: [{ code: 'integer' }], short: 'convert to integer' },
  { name: 'not', kind: 'function', types: [{ code: 'boolean' }], short: 'boolean negation' },
  { name: 'hasValue', kind: 'function', types: [{ code: 'boolean' }], short: 'primitive has value?' },
  { name: 'children', kind: 'function', types: [], short: 'all child nodes' },
  { name: 'descendants', kind: 'function', types: [], short: 'all descendant nodes' },
  { name: 'trace', kind: 'function', types: [], short: 'log and pass through', hasParams: true },
]

/** Elements (and functions) valid after `baseExpression.` — the caret's
 * resolved type drives the list, exactly like TwoSlash `^|`. */
export async function suggest(resourceType: string, baseExpression: string): Promise<Completion[]> {
  const base = baseExpression.trim()
  const analysis = await analyze(resourceType, base || resourceType)
  const stash = FINALS.get(analysis)
  if (!stash) return []
  const out: Completion[] = []
  const seen = new Set<string>()
  for (const state of stash.final.states) {
    const kids = await stash.childElements(state)
    if (!kids) continue
    for (const el of kids.els) {
      const last = el.path.split('.').pop()!
      const stem = last.endsWith('[x]') ? last.slice(0, -3) : last
      if (seen.has(stem)) continue
      seen.add(stem)
      out.push({ name: stem, kind: 'element', types: el.types, short: el.short })
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return base ? [...out, ...FHIRPATH_FUNCTIONS] : out
}

// ---------------------------------------------------------------------------
// did-you-mean
// ---------------------------------------------------------------------------

function didYouMean(input: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestDist = 3 // threshold: distance ≤ 2
  const lower = input.toLowerCase()
  for (const candidate of new Set(candidates)) {
    const d = levenshtein(lower, candidate.toLowerCase())
    if (d < bestDist) {
      bestDist = d
      best = candidate
    }
  }
  return best
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}
