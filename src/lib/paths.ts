/** Path segments into an example instance: property names and array indices. */
export type PathSeg = string | number

/** Render segments as a concrete FHIRPath, e.g. Patient.name[0].given[1]. */
export function toFhirPath(resourceType: string, segs: readonly PathSeg[]): string {
  let out = resourceType
  for (const seg of segs) {
    out += typeof seg === 'number' ? `[${seg}]` : `.${seg}`
  }
  return out
}

/** Stable map/set key for a segment list. */
export function pathKey(segs: readonly PathSeg[]): string {
  return segs.map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`)).join('')
}
