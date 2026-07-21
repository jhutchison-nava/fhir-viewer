/** BFD overlay distill tests — asserts the join against known dictionary facts. */
import { readFileSync } from 'node:fs'

const read = (p: string) => JSON.parse(readFileSync(new URL(`../public/schema/r4/bfd/${p}`, import.meta.url), 'utf8'))
const index = read('index.json')
const eob = read('explanationofbenefit.json')
const patient = read('patient.json')
const report = JSON.parse(readFileSync(new URL('../scripts/.cache/report-bfd.json', import.meta.url), 'utf8'))

const checks: [string, boolean][] = [
  ['629 fields in index', index.entries.length === 629],
  ['dictionary version pinned', index.version === '2.252.0'],
  ['>=600 mappings joined', report.mappingsJoined >= 600],
  // backbone children are snapshot elements, so the join resolves one level
  // deeper than the backbone itself — supportingInfo.code, not supportingInfo
  ['adjustment deletion code lands on EOB.supportingInfo.code', (eob['ExplanationOfBenefit.supportingInfo.code'] ?? []).some((a: any) => a.name === 'Adjustment Deletion Code' && a.fhirPath)],
  ['death date joins via choice stem', (patient['Patient.deceased[x]'] ?? []).some((a: any) => a.name === 'Beneficiary Death Date')],
  ['stale STU3 grouping entries reported, not hidden', report.failureDetails.filter((f: any) => f.element.startsWith('grouping.')).length === 2],
  ['index rows carry facets', index.entries.every((e: any) => Array.isArray(e.appliesTo) && Array.isArray(e.suppliedIn))],
  ['unjoined entries keep null elementPath', index.entries.some((e: any) => e.elementPath === null)],
]

let failures = 0
for (const [label, ok] of checks) {
  console.log((ok ? '✓' : '✗') + ' bfd: ' + label)
  if (!ok) failures++
}
console.log(failures ? `${failures} BFD FAILURES` : 'BFD PASS')
if (failures) process.exit(1)
