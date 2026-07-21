/**
 * Snapshot element tree on Ark UI TreeView: WAI-ARIA tree semantics,
 * arrow-key navigation, and typeahead come from the machine; row content
 * (flags, type labels, hover cards, binding chips) stays ours.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { TreeView } from '@ark-ui/react/tree-view'
import { createTreeCollection } from '@ark-ui/react/collection'
import { ChevronRight, CornerDownRight } from 'lucide-react'
import type { ElementNode, ElementType, SchemaChunk } from '~/lib/schema'
import { prefetchChunk } from '~/lib/schema'
import { cn } from '~/lib/cn'
import { isPrimitive } from './TypeLabel'
import { HoverCard } from './hover-card/HoverCardBase'
import { BindingCard, ElementDefCard, InteractiveTypeLabel } from './hover-card/cards'

interface Node {
  /** Unique tree value: element path, or `path::prop` for choice rows. */
  value: string
  /** Display segment, e.g. "deceased[x]" or "deceasedBoolean". */
  name: string
  el: ElementNode
  /** Set on synthetic choice rows: the single concrete type. */
  choice?: ElementType
  children?: Node[]
}

/** Arrange the flat snapshot path list into nodes; choice elements get
 * synthetic children (one per allowed type). Root element is dropped. */
function buildNodes(chunk: SchemaChunk): Node[] {
  const roots: Node[] = []
  const stack: { path: string; node: Node }[] = []
  for (const el of chunk.elements) {
    const segments = el.path.split('.')
    if (segments.length === 1) continue // root element (path === type)
    const node: Node = { value: el.path, name: segments[segments.length - 1], el }
    if (el.choiceOf?.length) {
      node.children = el.types.map((t, i) => ({
        value: `${el.path}::${el.choiceOf![i]}`,
        name: el.choiceOf![i],
        el,
        choice: t,
      }))
    }
    while (stack.length && !el.path.startsWith(stack[stack.length - 1].path + '.')) {
      stack.pop()
    }
    if (stack.length) {
      const parent = stack[stack.length - 1].node
      ;(parent.children ??= []).push(node)
    } else {
      roots.push(node)
    }
    stack.push({ path: el.path, node })
  }
  return roots
}

export function ElementTree({ chunk }: { chunk: SchemaChunk }) {
  const { collection, defaultExpanded } = useMemo(() => {
    const roots = buildNodes(chunk)
    return {
      collection: createTreeCollection<Node>({
        rootNode: { value: chunk.type, name: chunk.type, el: chunk.elements[0], children: roots },
        nodeToValue: (node) => node.value,
        nodeToString: (node) => node.name,
        nodeToChildren: (node) => node.children ?? [],
      }),
      // Backbone elements at the top level start open; choices start closed.
      defaultExpanded: roots
        .filter((n) => n.children?.length && !n.el.choiceOf)
        .map((n) => n.value),
    }
  }, [chunk])

  // GitHub-style permalink target: #el-<path> highlights the row, expands
  // its ancestors, and scrolls it to center. Driven by router location, not
  // the :target pseudo-class (which pushState doesn't recompute reliably).
  const hash = useLocation({ select: (location) => location.hash })
  const targetPath =
    hash.startsWith('el-') && hash.slice(3).split('.')[0] === chunk.type ? hash.slice(3) : null

  const [expanded, setExpanded] = useState<string[]>(defaultExpanded)
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded])
  useEffect(() => {
    if (!targetPath) return
    // Every dotted prefix of the target is an ancestor branch to open.
    const segments = targetPath.split('.')
    const ancestors = segments
      .slice(1, -1)
      .map((_, i) => segments.slice(0, i + 2).join('.'))
    setExpanded((prev) => [...new Set([...prev, ...ancestors])])
    requestAnimationFrame(() => {
      document.getElementById(`el-${targetPath}`)?.scrollIntoView({ block: 'center' })
    })
  }, [targetPath])

  // Warm the chunk cache for every complex type on the page so hover cards
  // open without a skeleton.
  useEffect(() => {
    const codes = new Set<string>()
    for (const el of chunk.elements) {
      for (const t of el.types) {
        if (!isPrimitive(t.code)) codes.add(t.code)
      }
    }
    codes.forEach(prefetchChunk)
  }, [chunk])

  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <TreeView.Root
        collection={collection}
        expandedValue={expanded}
        onExpandedChange={(details) => setExpanded(details.expandedValue)}
        selectionMode="single"
        // Node ids double as the #el-<path> anchor targets (contentRef links,
        // backlinks deep links). Don't set id on parts — the machine moves
        // focus by these ids.
        ids={{ node: (value) => `el-${value}` }}
        className="min-w-[42rem] font-mono text-[13px]"
        aria-label={`${chunk.type} elements`}
      >
        <TreeView.Tree className="outline-none">
          {collection.rootNode.children?.map((node, index) => (
            <ElementTreeNode
              key={node.value}
              node={node}
              indexPath={[index]}
              chunk={chunk}
              targetPath={targetPath}
            />
          ))}
        </TreeView.Tree>
      </TreeView.Root>
    </div>
  )
}

function ElementTreeNode({
  node,
  indexPath,
  chunk,
  targetPath,
}: {
  node: Node
  indexPath: number[]
  chunk: SchemaChunk
  targetPath: string | null
}) {
  const depth = indexPath.length - 1
  const indent = { paddingLeft: `${0.5 + depth * 1.25}rem` }
  const isHashTarget = !node.choice && node.el.path === targetPath

  if (node.choice) {
    return (
      <TreeView.NodeProvider node={node} indexPath={indexPath}>
        <TreeView.Item
          className="flex items-baseline gap-1.5 border-b border-line bg-inset/50 px-2 py-1 data-selected:bg-panel"
          style={indent}
        >
          <CornerDownRight size={11} className="self-center text-ink-faint" aria-hidden />
          <span className="font-medium">{node.name}</span>
          <InteractiveTypeLabel el={{ ...node.el, types: [node.choice], choiceOf: undefined }} />
        </TreeView.Item>
      </TreeView.NodeProvider>
    )
  }

  const row = <RowContent node={node} chunk={chunk} />

  if (node.children?.length) {
    return (
      <TreeView.NodeProvider node={node} indexPath={indexPath}>
        <TreeView.Branch>
          <TreeView.BranchControl
            data-hash-target={isHashTarget || undefined}
            className="group flex scroll-mt-14 items-start gap-2 border-b border-line px-2 py-1 hover:bg-panel data-hash-target:bg-flame-soft data-hash-target:shadow-[inset_2px_0_0] data-hash-target:shadow-flame data-selected:bg-panel"
            style={indent}
          >
            <TreeView.BranchIndicator
              className="self-center text-ink-faint transition-transform data-[state=open]:rotate-90"
              aria-hidden
            >
              <ChevronRight size={13} />
            </TreeView.BranchIndicator>
            {row}
          </TreeView.BranchControl>
          <TreeView.BranchContent>
            {node.children.map((child, i) => (
              <ElementTreeNode
                key={child.value}
                node={child}
                indexPath={[...indexPath, i]}
                chunk={chunk}
                targetPath={targetPath}
              />
            ))}
          </TreeView.BranchContent>
        </TreeView.Branch>
      </TreeView.NodeProvider>
    )
  }

  return (
    <TreeView.NodeProvider node={node} indexPath={indexPath}>
      <TreeView.Item
        data-hash-target={isHashTarget || undefined}
        className="group flex scroll-mt-14 items-start gap-2 border-b border-line px-2 py-1 hover:bg-panel data-hash-target:bg-flame-soft data-hash-target:shadow-[inset_2px_0_0] data-hash-target:shadow-flame data-selected:bg-panel"
        style={indent}
      >
        <span className="w-[13px] shrink-0" aria-hidden />
        {row}
      </TreeView.Item>
    </TreeView.NodeProvider>
  )
}

function RowContent({ node, chunk }: { node: Node; chunk: SchemaChunk }) {
  const { el, name } = node
  const isChoice = !!el.choiceOf?.length
  return (
    <>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <HoverCard content={<ElementDefCard chunk={chunk} el={el} />}>
          <span className={cn('font-medium', isChoice && 'text-t-choice')} title={el.path}>
            {name}
          </span>
        </HoverCard>
        <Flags el={el} />
        <Cardinality el={el} />
        {el.contentRef ? (
          <ContentRefLink target={el.contentRef} />
        ) : (
          <InteractiveTypeLabel el={el} />
        )}
        {el.binding && <BindingChip binding={el.binding} />}
      </span>
      <span className="hidden max-w-[45%] truncate pt-px text-right font-sans text-xs text-ink-mid md:block">
        {el.short}
      </span>
    </>
  )
}

function Flags({ el }: { el: ElementNode }) {
  if (!el.isModifier && !el.isSummary) return null
  return (
    <span className="space-x-0.5 text-[11px]">
      {el.isModifier && (
        <span title="Modifier element: changes the meaning of the resource" className="text-flame">
          ?!
        </span>
      )}
      {el.isSummary && (
        <span title="Included in summary (_summary=true)" className="text-ink-faint">
          Σ
        </span>
      )}
    </span>
  )
}

function Cardinality({ el }: { el: ElementNode }) {
  return (
    <span
      className={cn('text-xs', el.min > 0 ? 'font-semibold text-ink' : 'text-ink-faint')}
      title={el.min > 0 ? 'Required element' : undefined}
    >
      {el.min}..{el.max}
    </span>
  )
}

function ContentRefLink({ target }: { target: string }) {
  const path = target.replace(/^#/, '')
  return (
    // Router Link (not <a href="#...">) so the hash lands in router state,
    // which drives the permalink highlight + ancestor expansion above.
    <Link
      to="."
      search={(prev) => prev}
      hash={`el-${path}`}
      hashScrollIntoView={false}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs text-t-complex hover:underline"
      title={`Contents defined at ${path}`}
    >
      <CornerDownRight size={11} aria-hidden />
      see {path}
    </Link>
  )
}

function BindingChip({ binding }: { binding: NonNullable<ElementNode['binding']> }) {
  const label = binding.name ?? binding.url?.split('/').pop() ?? 'binding'
  return (
    <HoverCard content={<BindingCard binding={binding} />}>
      <span className="rounded-sm border border-line bg-panel px-1 text-[10px] leading-4 text-ink-mid">
        {label}
        <span className="text-ink-faint"> · {binding.strength}</span>
      </span>
    </HoverCard>
  )
}
