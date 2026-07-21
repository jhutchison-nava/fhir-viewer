/** Analyzer test harness: shims fetch to the filesystem, asserts type
 * resolution + diagnostics over a table of expressions. */
import { readFile } from 'node:fs/promises'

const PUBLIC = new URL('../public', import.meta.url).pathname
globalThis.fetch = (async (path: string) => {
  try {
    const body = await readFile(PUBLIC + path, 'utf8')
    return new Response(body, { status: 200 })
  } catch {
    return new Response('not found', { status: 404 })
  }
}) as typeof fetch

const { analyze } = await import('../src/lib/fhirpath-analyzer')

interface Case {
  resource: string
  expr: string
  /** expected type codes of the LAST segment (subset match) */
  end?: string[]
  /** expected diagnostic substring(s) */
  diag?: string[]
  didYouMean?: string
}

const cases: Case[] = [
  { resource: 'Patient', expr: 'name', end: ['HumanName'] },
  { resource: 'Patient', expr: 'Patient.name.family', end: ['string'] },
  { resource: 'Patient', expr: "name.where(use='official').family", end: ['string'] },
  { resource: 'Patient', expr: 'name.given[1]', end: ['string'] },
  { resource: 'Patient', expr: 'contact.name.given', end: ['string'] }, // backbone traversal
  { resource: 'Patient', expr: 'name.count()', end: ['integer'] },
  { resource: 'Observation', expr: 'value', end: ['Quantity', 'string', 'boolean'] }, // choice union
  { resource: 'Observation', expr: 'value.ofType(Quantity).unit', end: ['string'] },
  { resource: 'Patient', expr: 'nmae', diag: ["no element 'nmae' on Patient"], didYouMean: 'name' },
  { resource: 'Patient', expr: 'contact.nmae', diag: ["no element 'nmae'"], didYouMean: 'name' },
  { resource: 'Patient', expr: "name.where(usee='official')", diag: ["no element 'usee'"], didYouMean: 'use' },
  { resource: 'Patient', expr: 'name | contact.name', end: ['HumanName'] },
  { resource: 'Patient', expr: 'name.exists()', end: ['boolean'] },
  { resource: 'Patient', expr: 'generalPractitioner.resolve()', end: [] }, // unknown, no crash
  { resource: 'Patient', expr: 'name.frobnicate()', diag: ["unknown function 'frobnicate'"] },
  { resource: 'Patient', expr: 'name.where(', diag: ['parse error'] },
  { resource: 'Questionnaire', expr: 'item.item.text', end: ['string'] }, // contentRef recursion
  { resource: 'Patient', expr: 'name.count() > 3', end: [] }, // operator; boolean overall
]

let failures = 0
for (const c of cases) {
  const { segments, diagnostics } = await analyze(c.resource, c.expr)
  const last = segments[segments.length - 1]
  const endTypes = last?.types.map((t: any) => t.code) ?? []
  const problems: string[] = []
  if (c.end && c.end.length && !c.end.every((t) => endTypes.includes(t))) {
    problems.push(`end types ${JSON.stringify(endTypes)} missing ${JSON.stringify(c.end)}`)
  }
  for (const d of c.diag ?? []) {
    if (!diagnostics.some((x: any) => x.message.includes(d))) problems.push(`missing diagnostic '${d}'`)
  }
  if (c.didYouMean && !diagnostics.some((x: any) => x.didYouMean === c.didYouMean)) {
    problems.push(`missing didYouMean '${c.didYouMean}'`)
  }
  const chain = segments.map((s: any) => `${s.text}:${s.types.map((t: any) => t.code).join('|') || '?'}`).join(' → ')
  if (problems.length) {
    failures++
    console.log(`✗ [${c.resource}] ${c.expr}\n    ${problems.join('; ')}\n    chain: ${chain}\n    diags: ${diagnostics.map((d: any) => d.message + (d.didYouMean ? ` (→${d.didYouMean})` : '')).join(' ;; ')}`)
  } else {
    console.log(`✓ [${c.resource}] ${c.expr}  ⇒  ${chain}`)
  }
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS')
process.exit(failures ? 1 : 0)
