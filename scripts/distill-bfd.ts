/**
 * Distill the BFD V2 data dictionary into overlay chunks joined onto the
 * R4 schema chunks by element path. Run with `npm run distill:bfd` (after
 * `npm run distill`, which produces the chunks we join against).
 *
 * Outputs:
 *   public/schema/r4/bfd/index.json          — all 629 fields (browser/search)
 *   public/schema/r4/bfd/<resource>.json     — elementPath -> annotations
 *   scripts/.cache/report-bfd.json           — join report (also printed)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BfdAnnotation, BfdIndex, BfdIndexEntry, BfdOverlay, SchemaChunk } from '../src/lib/schema-types'

const DICTIONARY_VERSION = '2.252.0'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'scripts', 'data', `v2-data-dictionary-${DICTIONARY_VERSION}.json`)
const CHUNKS = join(ROOT, 'public', 'schema', 'r4', 'resources')
const OUT = join(ROOT, 'public', 'schema', 'r4', 'bfd')
const REPORT = join(ROOT, 'scripts', '.cache', 'report-bfd.json')

interface DictFhirMapping {
  version: string
  resource: string
  element: string
  fhirPath?: string
  discriminator?: string[]
  additional?: string[]
  example?: string
}

interface DictEntry {
  id: number
  name: string
  description: string
  appliesTo: string[]
  suppliedIn: string[]
  ccwMapping: string[]
  fhirMapping: DictFhirMapping[]
}

type JoinFailure = 'no-resource' | 'compound' | 'stale-path'

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Element paths (and choice metadata) for one resource chunk. */
function loadChunkPaths(resource: string): { paths: Set<string>; choices: Map<string, string[]> } | null {
  try {
    const chunk: SchemaChunk = JSON.parse(readFileSync(join(CHUNKS, `${resource.toLowerCase()}.json`), 'utf8'))
    const paths = new Set<string>()
    const choices = new Map<string, string[]>() // "Patient.deceased[x]" -> choiceOf names
    for (const el of chunk.elements) {
      paths.add(el.path)
      if (el.choiceOf?.length) choices.set(el.path, el.choiceOf)
    }
    return { paths, choices }
  } catch {
    return null
  }
}

/**
 * Join a dictionary element path onto a base-R4 element path.
 * Strategy: strip [N]/[digits] markers, then accept the LONGEST dotted
 * prefix that exists in the chunk — trying each segment both literally and
 * as a choice property (deceasedDateTime matches deceased[x] when the name
 * appears in choiceOf).
 */
function joinElementPath(
  resource: string,
  rawElement: string,
  chunkInfo: { paths: Set<string>; choices: Map<string, string[]> },
): { path: string | null; reason?: JoinFailure } {
  let element = rawElement
  let compound = false
  if (element.includes(' AND ')) {
    element = element.split(' AND ')[0]
    compound = true
  }
  const segments = element
    .replace(/\[N\]|\[\d+\]/g, '')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!segments.length) return { path: null, reason: compound ? 'compound' : 'stale-path' }

  // Resolve segment-by-segment so choice renames apply mid-path too.
  let current = resource
  let resolved: string | null = null
  for (const seg of segments) {
    const literal = `${current}.${seg}`
    if (chunkInfo.paths.has(literal)) {
      current = literal
      resolved = literal
      continue
    }
    // choice property? find a `${current}.<stem>[x]` whose choiceOf includes seg
    const choiceHit = [...chunkInfo.choices.entries()].find(
      ([path, names]) => path.startsWith(current + '.') &&
        path.split('.').length === current.split('.').length + 1 &&
        names.includes(seg),
    )
    if (choiceHit) {
      current = choiceHit[0]
      resolved = choiceHit[0]
      continue
    }
    break // deepest resolvable prefix reached
  }
  if (!resolved) return { path: null, reason: compound ? 'compound' : 'stale-path' }
  return { path: resolved }
}

function main() {
  const dict: DictEntry[] = JSON.parse(readFileSync(SOURCE, 'utf8'))

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const chunkCache = new Map<string, ReturnType<typeof loadChunkPaths>>()
  const overlays = new Map<string, BfdOverlay>()
  const entries: BfdIndexEntry[] = []
  const failures: { id: number; name: string; resource: string; element: string; reason: JoinFailure }[] = []
  let joined = 0

  for (const entry of dict) {
    // One index row per entry; join against its first R4 mapping with a
    // resource (629/629 entries have >=1 mapping; a few have blank resource).
    let indexPath: string | null = null
    let indexResource = ''

    for (const fm of entry.fhirMapping ?? []) {
      if (fm.version !== 'R4') continue
      if (!fm.resource) {
        failures.push({ id: entry.id, name: entry.name, resource: '', element: fm.element, reason: 'no-resource' })
        continue
      }
      if (!chunkCache.has(fm.resource)) chunkCache.set(fm.resource, loadChunkPaths(fm.resource))
      const chunkInfo = chunkCache.get(fm.resource)
      if (!chunkInfo) {
        failures.push({ id: entry.id, name: entry.name, resource: fm.resource, element: fm.element, reason: 'stale-path' })
        continue
      }
      const { path, reason } = joinElementPath(fm.resource, fm.element, chunkInfo)
      if (!path) {
        failures.push({ id: entry.id, name: entry.name, resource: fm.resource, element: fm.element, reason: reason! })
        continue
      }
      joined++
      if (!indexPath) {
        indexPath = path
        indexResource = fm.resource
      }
      const annotation: BfdAnnotation = {
        id: entry.id,
        name: entry.name,
        description: truncate(entry.description ?? '', 500),
        appliesTo: (entry.appliesTo ?? []).filter(Boolean),
        suppliedIn: (entry.suppliedIn ?? []).filter(Boolean),
        ccw: entry.ccwMapping ?? [],
        element: fm.element,
        ...(fm.fhirPath ? { fhirPath: fm.fhirPath } : {}),
        ...(fm.discriminator?.length ? { discriminator: fm.discriminator } : {}),
        ...(fm.additional?.length ? { additional: fm.additional.slice(0, 8) } : {}),
        ...(fm.example ? { example: truncate(String(fm.example), 200) } : {}),
      }
      const overlay = overlays.get(fm.resource) ?? {}
      ;(overlay[path] ??= []).push(annotation)
      overlays.set(fm.resource, overlay)
    }

    entries.push({
      id: entry.id,
      name: entry.name,
      resource: indexResource || (entry.fhirMapping?.[0]?.resource ?? ''),
      elementPath: indexPath,
      appliesTo: (entry.appliesTo ?? []).filter(Boolean),
      suppliedIn: (entry.suppliedIn ?? []).filter(Boolean),
      ccw: entry.ccwMapping ?? [],
      hasFhirPath: (entry.fhirMapping ?? []).some((m) => !!m.fhirPath),
    })
  }

  const index: BfdIndex = { version: DICTIONARY_VERSION, entries }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))
  for (const [resource, overlay] of overlays) {
    writeFileSync(join(OUT, `${resource.toLowerCase()}.json`), JSON.stringify(overlay))
  }

  const byReason: Record<string, number> = {}
  for (const f of failures) byReason[f.reason] = (byReason[f.reason] ?? 0) + 1
  const report = {
    dictionaryVersion: DICTIONARY_VERSION,
    entries: entries.length,
    mappingsJoined: joined,
    failures: byReason,
    failureDetails: failures,
    resources: [...overlays.keys()],
    annotatedPaths: Object.fromEntries([...overlays].map(([r, o]) => [r, Object.keys(o).length])),
  }
  mkdirSync(dirname(REPORT), { recursive: true })
  writeFileSync(REPORT, JSON.stringify(report, null, 2))
  console.log(
    `bfd: ${entries.length} fields, ${joined} mappings joined onto ` +
      `${report.resources.join('/')} (${JSON.stringify(report.annotatedPaths)}); ` +
      `failures: ${JSON.stringify(byReason)} — details in scripts/.cache/report-bfd.json`,
  )
}

main()
