/**
 * Example-instance JSON view on Ark UI TreeView: treeitem semantics, arrow
 * keys, and typeahead over keys come from the machine. Selecting a node
 * (click or Enter) copies its FHIRPath via one Ark Clipboard machine and
 * loads it into the FHIRPath bar. Hovering shows the node's path in a
 * sticky chip; FHIRPath evaluation feeds `highlights`.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TreeView } from '@ark-ui/react/tree-view'
import { useClipboard } from '@ark-ui/react/clipboard'
import { createTreeCollection } from '@ark-ui/react/collection'
import { ChevronDown } from 'lucide-react'
import { pathKey, toFhirPath, type PathSeg } from '~/lib/paths'
import { cn } from '~/lib/cn'

interface JNode {
  /** Unique tree value: 'p' + pathKey(segs); root = 'p'. */
  value: string
  key: string | number | null
  jsonValue: unknown
  segs: readonly PathSeg[]
  children?: JNode[]
}

function buildNode(jsonValue: unknown, key: string | number | null, segs: readonly PathSeg[]): JNode {
  const node: JNode = { value: 'p' + pathKey(segs), key, jsonValue, segs }
  if (Array.isArray(jsonValue)) {
    node.children = jsonValue.map((child, i) => buildNode(child, i, [...segs, i]))
  } else if (jsonValue !== null && typeof jsonValue === 'object') {
    node.children = Object.entries(jsonValue).map(([k, child]) =>
      buildNode(child, k, [...segs, k]),
    )
  }
  return node
}

function collectBranchValues(node: JNode, out: string[] = []): string[] {
  if (node.children) {
    out.push(node.value)
    node.children.forEach((child) => collectBranchValues(child, out))
  }
  return out
}

interface TreeCtx {
  resourceType: string
  setHovered: (segs: readonly PathSeg[] | null) => void
  highlights: ReadonlySet<string>
  highlightTrail: ReadonlySet<string>
}

const Ctx = createContext<TreeCtx | null>(null)

export interface JsonTreeProps {
  data: unknown
  resourceType: string
  /** pathKey()s of nodes to mark as FHIRPath matches. */
  highlights?: ReadonlySet<string>
  /** Also fired on copy-select, e.g. to load the path into the FHIRPath bar. */
  onPathClick?: (segs: readonly PathSeg[]) => void
}

export function JsonTree({ data, resourceType, highlights, onPathClick }: JsonTreeProps) {
  const [hovered, setHovered] = useState<readonly PathSeg[] | null>(null)
  // Copy is two-step (set value, copy in an effect): calling copy() in the
  // same tick as setValue uses the machine's stale render-time value.
  const [pendingCopy, setPendingCopy] = useState<string | null>(null)
  const clipboard = useClipboard({ value: pendingCopy ?? '', timeout: 1200 })
  const copyRef = useRef(clipboard.copy)
  copyRef.current = clipboard.copy
  useEffect(() => {
    if (pendingCopy) copyRef.current()
  }, [pendingCopy])

  const { collection, nodesByValue, allBranches } = useMemo(() => {
    const rootNode = buildNode(data, null, [])
    const nodesByValue = new Map<string, JNode>()
    const walk = (node: JNode) => {
      nodesByValue.set(node.value, node)
      node.children?.forEach(walk)
    }
    walk(rootNode)
    return {
      collection: createTreeCollection<JNode>({
        rootNode,
        nodeToValue: (node) => node.value,
        nodeToString: (node) => String(node.key ?? ''),
        nodeToChildren: (node) => node.children ?? [],
      }),
      nodesByValue,
      allBranches: collectBranchValues(rootNode),
    }
  }, [data])

  const highlightTrail = useMemo(() => {
    // Ancestors of matches get a subtle rail so collapsed context is visible.
    const trail = new Set<string>()
    for (const key of highlights ?? []) {
      const segs = key.match(/\.[^.[]+|\[\d+\]/g) ?? []
      for (let i = 0; i < segs.length; i++) trail.add(segs.slice(0, i).join(''))
    }
    return trail
  }, [highlights])

  const ctx: TreeCtx = {
    resourceType,
    setHovered,
    highlights: highlights ?? new Set(),
    highlightTrail,
  }

  // Scroll the first match into view when highlights change.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!highlights?.size) return
    rootRef.current
      ?.querySelector('[data-match="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlights])

  return (
    <Ctx.Provider value={ctx}>
      <div ref={rootRef} className="relative overflow-x-auto rounded-sm border border-line">
        <PathChip
          resourceType={resourceType}
          hovered={hovered}
          copied={clipboard.copied ? clipboard.value : null}
        />
        <TreeView.Root
          collection={collection}
          defaultExpandedValue={allBranches}
          selectionMode="single"
          expandOnClick={false}
          onSelectionChange={({ selectedValue }) => {
            const node = selectedValue[0] ? nodesByValue.get(selectedValue[0]) : undefined
            if (!node) return
            setPendingCopy(toFhirPath(resourceType, node.segs))
            onPathClick?.(node.segs)
          }}
          className="min-w-fit px-3 py-2 font-mono text-[13px] leading-relaxed"
          onMouseLeave={() => setHovered(null)}
        >
          <TreeView.Tree className="outline-none" aria-label={`${resourceType} example JSON`}>
            <JNodeRow node={collection.rootNode} indexPath={[]} />
          </TreeView.Tree>
        </TreeView.Root>
      </div>
    </Ctx.Provider>
  )
}

function PathChip({
  resourceType,
  hovered,
  copied,
}: {
  resourceType: string
  hovered: readonly PathSeg[] | null
  copied: string | null
}) {
  if (!hovered && !copied) return null
  return (
    <div className="pointer-events-none sticky top-1 z-10 flex h-0 justify-end pr-2">
      <span
        className={cn(
          'rounded-sm border px-1.5 py-0.5 font-mono text-[11px] shadow-sm',
          copied
            ? 'border-t-primitive/50 bg-panel text-t-primitive'
            : 'border-line-strong bg-panel text-ink',
        )}
      >
        {copied ? `copied ${copied}` : toFhirPath(resourceType, hovered!)}
      </span>
    </div>
  )
}

function JNodeRow({ node, indexPath }: { node: JNode; indexPath: number[] }) {
  const ctx = useContext(Ctx)!
  const isMatch = ctx.highlights.has(pathKey(node.segs))
  const onTrail = ctx.highlightTrail.has(pathKey(node.segs))
  const isArrayChild = typeof node.key === 'number'
  const brackets = Array.isArray(node.jsonValue) ? '[]' : '{}'

  const rowClass = cn(
    'cursor-copy rounded-[1px] data-selected:bg-panel',
    isMatch && 'bg-match outline-1 -outline-offset-1 outline-match-line',
    !isMatch && onTrail && 'border-l-2 border-match-line',
  )
  const rowProps = {
    'data-match': isMatch || undefined,
    title: `Copy ${toFhirPath(ctx.resourceType, node.segs)}`,
    onMouseOver: (e: React.MouseEvent) => {
      e.stopPropagation()
      ctx.setHovered(node.segs)
    },
  }

  const keyLabel =
    node.key === null ? null : (
      <>
        <span className={isArrayChild ? 'text-ink-faint' : 'font-medium text-t-complex'}>
          {isArrayChild ? `[${node.key}]` : `"${node.key}"`}
        </span>
        <span className="text-ink-faint">: </span>
      </>
    )

  if (!node.children) {
    return (
      <TreeView.NodeProvider node={node} indexPath={indexPath}>
        <TreeView.Item className={rowClass} {...rowProps}>
          {keyLabel}
          <PrimitiveValue value={node.jsonValue} />
        </TreeView.Item>
      </TreeView.NodeProvider>
    )
  }

  return (
    <TreeView.NodeProvider node={node} indexPath={indexPath}>
      <TreeView.Branch className="group/branch">
        <TreeView.BranchControl className={rowClass} {...rowProps}>
          {keyLabel}
          {/* Dedicated toggle target so row clicks copy instead of collapsing */}
          <TreeView.BranchTrigger
            className="inline cursor-pointer align-baseline text-ink-faint hover:text-ink"
            onClick={(e) => e.stopPropagation()}
            aria-label="Toggle"
          >
            <ChevronDown
              size={12}
              className="mb-px inline transition-transform group-data-[state=closed]/branch:-rotate-90"
              aria-hidden
            />
            {brackets[0]}
            <span className="hidden text-[11px] group-data-[state=closed]/branch:inline">
              …{brackets[1]} {node.children.length} {Array.isArray(node.jsonValue) ? 'items' : 'fields'}
            </span>
          </TreeView.BranchTrigger>
        </TreeView.BranchControl>
        <TreeView.BranchContent className="border-l border-line pl-4 hover:border-line-strong">
          {node.children.map((child, i) => (
            <JNodeRow key={child.value} node={child} indexPath={[...indexPath, i]} />
          ))}
        </TreeView.BranchContent>
        <span className="hidden text-ink-faint group-data-[state=open]/branch:inline">
          {brackets[1]}
        </span>
      </TreeView.Branch>
    </TreeView.NodeProvider>
  )
}

function PrimitiveValue({ value }: { value: unknown }) {
  // Collapse embedded whitespace (xhtml narratives) so lines stay readable.
  const display =
    typeof value === 'string' ? `"${truncate(value.replace(/\s+/g, ' '), 240)}"` : String(value)
  return (
    <span
      className={cn(
        'break-all align-baseline',
        typeof value === 'string' && 'text-t-primitive',
        typeof value === 'number' && 'text-t-choice',
        (typeof value === 'boolean' || value === null) && 'text-t-reference',
      )}
    >
      {display}
    </span>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
