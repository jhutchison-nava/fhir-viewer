/**
 * Client-side access to the distilled schema chunks under /schema/r4/.
 * Single in-memory cache; chunks are immutable so entries never expire.
 *
 * This module is the seam for later data modes (live server, local dataset):
 * keep all chunk access behind these functions.
 */
import type { BacklinksIndex, Catalog, SchemaChunk } from './schema-types'

export type { Backlink, BacklinksIndex, Catalog, CatalogResource, CatalogType, ElementBinding, ElementNode, ElementType, SchemaChunk } from './schema-types'

const BASE = `${import.meta.env.BASE_URL}schema/r4`

const cache = new Map<string, Promise<unknown>>()

function fetchJson<T>(path: string): Promise<T> {
  let hit = cache.get(path)
  if (!hit) {
    hit = fetch(path).then((res) => {
      if (!res.ok) {
        cache.delete(path) // don't cache failures
        throw new SchemaNotFoundError(path, res.status)
      }
      return res.json()
    })
    cache.set(path, hit)
  }
  return hit as Promise<T>
}

export class SchemaNotFoundError extends Error {
  constructor(
    public path: string,
    public status: number,
  ) {
    super(`schema chunk ${path} failed with HTTP ${status}`)
  }
}

export function getCatalog(): Promise<Catalog> {
  return fetchJson(`${BASE}/catalog.json`)
}

export function getResource(type: string): Promise<SchemaChunk> {
  return fetchJson(`${BASE}/resources/${type.toLowerCase()}.json`)
}

export function getDataType(type: string): Promise<SchemaChunk> {
  return fetchJson(`${BASE}/types/${type.toLowerCase()}.json`)
}

/** Resolves a type name against the catalog (no 404 probing). */
export async function getChunk(type: string): Promise<SchemaChunk> {
  const catalog = await getCatalog()
  if (catalog.types.some((t) => t.type === type)) return getDataType(type)
  try {
    return await getResource(type)
  } catch {
    // safety net for names outside the catalog
    return getDataType(type)
  }
}

export async function getExample(type: string): Promise<Record<string, unknown> | null> {
  try {
    return await fetchJson(`${BASE}/examples/${type.toLowerCase()}.json`)
  } catch {
    return null // a handful of resources ship no example
  }
}

export function getBacklinks(): Promise<BacklinksIndex> {
  return fetchJson(`${BASE}/backlinks.json`)
}

/** Idle-time warm-up so hover cards open without a loading skeleton. */
export function prefetchChunk(type: string) {
  const idle =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (fn: () => void) => setTimeout(fn, 200)
  idle(() => {
    getChunk(type).catch(() => { })
  })
}
