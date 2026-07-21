/**
 * Distill hl7.fhir.r4.core (+ examples) into static schema chunks under
 * public/schema/r4/. Run with `npm run distill`. Deterministic; output is
 * committed to git.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Backlink,
  BacklinksIndex,
  Catalog,
  CatalogResource,
  CatalogType,
  ElementBinding,
  ElementNode,
  ElementType,
  SchemaChunk,
} from '../src/lib/schema-types'
import { categorize, isMapped } from './categories'

const FHIR_VERSION = '4.0.1'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT = join(ROOT, 'public', 'schema', 'r4')

const REGISTRIES = ['https://packages2.fhir.org/packages', 'https://packages.fhir.org']

const SD_PREFIX = 'http://hl7.org/fhir/StructureDefinition/'

// ---------------------------------------------------------------------------
// Package acquisition
// ---------------------------------------------------------------------------

async function fetchTarball(pkg: string): Promise<string> {
  const tgz = join(CACHE, `${pkg}-${FHIR_VERSION}.tgz`)
  if (existsSync(tgz) && statSync(tgz).size > 0) return tgz
  mkdirSync(CACHE, { recursive: true })
  let lastError: unknown
  for (const registry of REGISTRIES) {
    // FHIR package servers implement the npm protocol; GET on
    // <registry>/<pkg>/<version> redirects to the tarball itself.
    const url = `${registry}/${pkg}/${FHIR_VERSION}`
    try {
      console.log(`fetching ${url}`)
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      // Sanity: gzip magic bytes, not an error page
      if (buf.length < 1024 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
        throw new Error(`response does not look like a tarball (${buf.length} bytes)`)
      }
      writeFileSync(tgz, buf)
      return tgz
    } catch (err) {
      lastError = err
      console.warn(`  failed: ${err}`)
    }
  }
  throw new Error(`could not download ${pkg}@${FHIR_VERSION}: ${lastError}`)
}

async function extractPackage(pkg: string, dir: string): Promise<string> {
  const dest = join(CACHE, dir)
  const marker = join(dest, 'package', 'package.json')
  if (existsSync(marker)) return dest
  const tgz = await fetchTarball(pkg)
  mkdirSync(dest, { recursive: true })
  execFileSync('tar', ['-xzf', tgz, '-C', dest])
  return dest
}

// ---------------------------------------------------------------------------
// StructureDefinition -> ElementNode[]
// ---------------------------------------------------------------------------

type Json = Record<string, any>

function extensionValue(el: Json | undefined, url: string): any {
  const ext = el?.extension?.find((e: Json) => e.url === url)
  if (!ext) return undefined
  const key = Object.keys(ext).find((k) => k.startsWith('value'))
  return key ? ext[key] : undefined
}

function stripProfile(url: string): string {
  return url.startsWith(SD_PREFIX) ? url.slice(SD_PREFIX.length) : url
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function toElementTypes(el: Json): ElementType[] {
  const raw: Json[] = el.type ?? []
  const out: ElementType[] = []
  for (const t of raw) {
    let code: string = t.code
    // Primitive value elements carry FHIRPath system types; surface the
    // declared fhir-type extension name instead (e.g. "string").
    if (code.startsWith('http://hl7.org/fhirpath/System.')) {
      const declared = extensionValue(t, 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type')
      code = declared ?? code.split('.').pop()!.toLowerCase()
    }
    const entry: ElementType = { code }
    if (code === 'Reference' || code === 'canonical') {
      const targets = (t.targetProfile ?? []).map(stripProfile)
      if (targets.length) entry.targets = targets
    }
    // Snapshot type arrays repeat codes only in edge cases; dedupe by code.
    if (!out.some((e) => e.code === entry.code)) out.push(entry)
  }
  return out
}

function toBinding(el: Json): ElementBinding | undefined {
  const b = el.binding
  if (!b?.strength) return undefined
  const binding: ElementBinding = { strength: b.strength }
  const name = extensionValue(b, 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName')
  if (name) binding.name = name
  if (b.valueSet) binding.url = String(b.valueSet).split('|')[0]
  return binding
}

function toElementNode(el: Json): ElementNode {
  const node: ElementNode = {
    path: el.path,
    min: el.min ?? 0,
    max: el.max ?? '1',
    types: toElementTypes(el),
  }
  if (el.short) node.short = el.short
  if (el.definition && el.definition !== el.short) node.definition = el.definition
  if (el.path.endsWith('[x]')) {
    const stem = el.path.split('.').pop()!.replace('[x]', '')
    node.choiceOf = node.types.map((t) => stem + upperFirst(t.code))
  }
  if (el.contentReference) node.contentRef = el.contentReference
  const binding = toBinding(el)
  if (binding) node.binding = binding
  if (el.isSummary) node.isSummary = true
  if (el.isModifier) node.isModifier = true
  return node
}

function toChunk(sd: Json): SchemaChunk {
  const elements = (sd.snapshot?.element ?? [])
    // v1: skip sliced elements
    .filter((el: Json) => !el.sliceName && !String(el.id ?? '').includes(':'))
    .map(toElementNode)
  const chunk: SchemaChunk = {
    type: sd.type,
    kind: sd.kind,
    url: sd.url,
    version: FHIR_VERSION,
    abstract: !!sd.abstract,
    elements,
  }
  if (sd.baseDefinition) chunk.base = stripProfile(sd.baseDefinition)
  if (sd.description) chunk.description = sd.description
  const fmm = extensionValue(sd, 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fmm')
  if (fmm !== undefined) chunk.fmm = fmm
  const status = extensionValue(sd, 'http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status')
  if (status) chunk.standardsStatus = status
  return chunk
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

const EXAMPLE_SIZE_CEILING = 100 * 1024

function pickExample(examplesDir: string, type: string): Json | undefined {
  const dir = join(examplesDir, 'package')
  const prefix = `${type}-`
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => ({ file: join(dir, f), name: f, size: statSync(join(dir, f)).size }))
  if (!candidates.length) return undefined

  const canonical = candidates.find((c) => c.name === `${type}-example.json`)
  let chosen = canonical && canonical.size <= EXAMPLE_SIZE_CEILING ? canonical : undefined
  if (!chosen) {
    // Smallest non-trivial example; filename prefix can collide across types
    // (e.g. "List-" vs "ListX-"), so verify resourceType on parse below.
    chosen = candidates.sort((a, b) => a.size - b.size)[0]
  }
  for (const candidate of chosen === canonical ? [chosen] : candidates.sort((a, b) => a.size - b.size)) {
    try {
      const parsed = JSON.parse(readFileSync(candidate.file, 'utf8'))
      if (parsed.resourceType === type) return parsed
    } catch {
      // skip unparseable candidates
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const corePkg = await extractPackage('hl7.fhir.r4.core', 'core')
  const examplesPkg = await extractPackage('hl7.fhir.r4.examples', 'examples')

  const pkgDir = join(corePkg, 'package')
  const sdFiles = readdirSync(pkgDir).filter(
    (f) => f.startsWith('StructureDefinition-') && f.endsWith('.json'),
  )

  rmSync(OUT, { recursive: true, force: true })
  for (const sub of ['resources', 'types', 'examples']) {
    mkdirSync(join(OUT, sub), { recursive: true })
  }

  const resources: CatalogResource[] = []
  const types: CatalogType[] = []
  const backlinks: BacklinksIndex = {}
  let exampleCount = 0

  for (const file of sdFiles.sort()) {
    const sd: Json = JSON.parse(readFileSync(join(pkgDir, file), 'utf8'))
    // Core definitions only; profiles (derivation=constraint) are out of scope
    // except primitive/complex base types themselves.
    if (sd.derivation === 'constraint') continue

    const chunk = toChunk(sd)
    const lower = sd.id.toLowerCase()

    if (sd.kind === 'resource') {
      writeFileSync(join(OUT, 'resources', `${lower}.json`), JSON.stringify(chunk))
      if (!sd.abstract) {
        if (!isMapped(sd.type)) console.warn(`  uncategorized resource: ${sd.type}`)
        const { category, subcategory } = categorize(sd.type)
        const example = pickExample(examplesPkg, sd.type)
        if (example) {
          writeFileSync(join(OUT, 'examples', `${lower}.json`), JSON.stringify(example))
          exampleCount++
        }
        resources.push({
          type: sd.type,
          short: firstSentence(sd.description ?? ''),
          category,
          subcategory,
          ...(chunk.fmm !== undefined ? { fmm: chunk.fmm } : {}),
          ...(chunk.standardsStatus ? { standardsStatus: chunk.standardsStatus } : {}),
          hasExample: !!example,
        })
        // Backlinks: invert every Reference(...) target on this resource.
        for (const el of chunk.elements) {
          for (const t of el.types) {
            if (t.code !== 'Reference') continue
            const link: Backlink = { path: el.path, source: sd.type }
            const targets = t.targets?.length ? t.targets : ['Resource']
            for (const target of targets) {
              ;(backlinks[target] ??= []).push(link)
            }
          }
        }
      }
    } else if (sd.kind === 'complex-type') {
      writeFileSync(join(OUT, 'types', `${lower}.json`), JSON.stringify(chunk))
      types.push({
        type: sd.type,
        kind: 'complex',
        short: firstSentence(sd.description ?? ''),
        ...(sd.abstract ? { abstract: true } : {}),
      })
    } else if (sd.kind === 'primitive-type') {
      writeFileSync(join(OUT, 'types', `${lower}.json`), JSON.stringify(chunk))
      types.push({ type: sd.type, kind: 'primitive', short: firstSentence(sd.description ?? '') })
    }
  }

  for (const list of Object.values(backlinks)) {
    list.sort((a, b) => a.path.localeCompare(b.path))
  }

  resources.sort((a, b) => a.type.localeCompare(b.type))
  types.sort((a, b) => a.type.localeCompare(b.type))
  const catalog: Catalog = { fhirVersion: FHIR_VERSION, resources, types }
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog))
  writeFileSync(join(OUT, 'backlinks.json'), JSON.stringify(backlinks))

  const totalBytes = du(OUT)
  console.log(
    `distilled ${resources.length} resources, ${types.length} datatypes, ` +
      `${exampleCount} examples, backlinks for ${Object.keys(backlinks).length} targets ` +
      `(${(totalBytes / 1024 / 1024).toFixed(1)} MB total)`,
  )
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](?:\s|$)/s)
  return (m ? m[0] : text).trim()
}

function du(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    total += entry.isDirectory() ? du(p) : statSync(p).size
  }
  return total
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
