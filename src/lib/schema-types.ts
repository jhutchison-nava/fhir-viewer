/**
 * Shared types for the distilled FHIR R4 schema chunks.
 * Produced by scripts/distill.ts, consumed by src/lib/schema.ts.
 */

export interface ElementType {
  code: string
  /** Resource names a Reference(...) may point at (stripped of URL prefix). */
  targets?: string[]
}

export interface ElementBinding {
  strength: 'required' | 'extensible' | 'preferred' | 'example'
  name?: string
  /** Canonical ValueSet URL, version suffix stripped. */
  url?: string
}

export interface ElementNode {
  /** Dotted path as it appears in the snapshot, e.g. "Patient.deceased[x]" */
  path: string
  short?: string
  definition?: string
  min: number
  max: string
  types: ElementType[]
  /** For choice elements: concrete property names, e.g. ["deceasedBoolean", "deceasedDateTime"] */
  choiceOf?: string[]
  /** contentReference target, e.g. "#Questionnaire.item" */
  contentRef?: string
  binding?: ElementBinding
  isSummary?: boolean
  isModifier?: boolean
}

/** One per-resource or per-datatype chunk file. */
export interface SchemaChunk {
  type: string
  kind: 'resource' | 'complex-type' | 'primitive-type'
  url: string
  version: string
  base?: string
  abstract: boolean
  description?: string
  /** FHIR Maturity Model level, when declared. */
  fmm?: number
  /** standards-status extension: normative | trial-use | ... */
  standardsStatus?: string
  elements: ElementNode[]
}

export interface CatalogResource {
  type: string
  short: string
  category: string
  subcategory: string
  fmm?: number
  standardsStatus?: string
  hasExample: boolean
}

export interface CatalogType {
  type: string
  kind: 'complex' | 'primitive'
  short: string
  /** Abstract base types (Element, BackboneElement) — resolvable but not listed. */
  abstract?: boolean
}

export interface Catalog {
  fhirVersion: string
  resources: CatalogResource[]
  types: CatalogType[]
}

/** One element that references a target type. */
export interface Backlink {
  /** Element path, e.g. "CarePlan.subject" */
  path: string
  /** Source resource type, e.g. "CarePlan" */
  source: string
}

/** targetType -> referencing elements. "Resource" bucket = Reference(Any). */
export type BacklinksIndex = Record<string, Backlink[]>
