/**
 * Single entry point for FHIRPath evaluation. Always passes the R4 model —
 * without it, choice-type navigation (Observation.value -> valueQuantity)
 * silently returns nothing.
 */
import fhirpath from 'fhirpath'
import r4_model from 'fhirpath/fhir-context/r4'

export function evaluate(resource: unknown, expression: string): unknown[] {
  const result = fhirpath.evaluate(resource, expression, undefined, r4_model)
  return Array.isArray(result) ? result : [result]
}

/** Throws with fhirpath's parse error message if invalid. */
export function assertParses(expression: string): void {
  fhirpath.compile(expression, r4_model)
}
