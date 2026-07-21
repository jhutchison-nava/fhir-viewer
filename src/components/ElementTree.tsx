import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react'
import type { ElementNode, SchemaChunk } from '~/lib/schema'
import { cn } from '~/lib/cn'
import { TypeLabel } from './TypeLabel'

interface TreeNode {
  el: ElementNode
  /** Last path segment, e.g. "deceased[x]" */
  name: string
  depth: number
  children: TreeNode[]
}

/** Arrange the flat snapshot path list into a tree; root element is dropped. */
function buildTree(chunk: SchemaChunk): TreeNode[] {
  const roots: TreeNode[] = []
  const stack: TreeNode[] = []
  for (const el of chunk.elements) {
    const segments = el.path.split('.')
    if (segments.length === 1) continue // root element (path === type)
    const node: TreeNode = {
      el,
      name: segments[segments.length - 1],
      depth: segments.length - 2,
      children: [],
    }
    while (stack.length && !el.path.startsWith(stack[stack.length - 1].el.path + '.')) {
      stack.pop()
    }
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

export function ElementTree({ chunk }: { chunk: SchemaChunk }) {
  const roots = useMemo(() => buildTree(chunk), [chunk])
  // Paths the user explicitly toggled; everything else falls back to default
  // (backbone children collapsed, choices collapsed).
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  const toggle = (path: string) =>
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <div className="min-w-[42rem] font-mono text-[13px]">
        {roots.map((node) => (
          <Row key={node.el.path} node={node} toggled={toggled} onToggle={toggle} />
        ))}
      </div>
    </div>
  )
}

function Row({
  node,
  toggled,
  onToggle,
}: {
  node: TreeNode
  toggled: Set<string>
  onToggle: (path: string) => void
}) {
  const { el, name, depth } = node
  const isChoice = !!el.choiceOf?.length
  const expandable = node.children.length > 0 || isChoice
  const defaultOpen = node.children.length > 0 && depth === 0
  const open = expandable && (toggled.has(el.path) ? !defaultOpen : defaultOpen)

  return (
    <>
      <div
        id={`el-${el.path}`}
        className="group flex items-start gap-2 border-b border-line px-2 py-1 target:bg-flame-soft hover:bg-panel"
        style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {expandable ? (
            <button
              type="button"
              onClick={() => onToggle(el.path)}
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${el.path}`}
              className="-ml-0.5 self-center rounded-sm text-ink-faint hover:text-ink"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-[13px] shrink-0" aria-hidden />
          )}
          <span className={cn('font-medium', isChoice && 'text-t-choice')} title={el.path}>
            {name}
          </span>
          <Flags el={el} />
          <Cardinality el={el} />
          {el.contentRef ? <ContentRefLink target={el.contentRef} /> : <TypeLabel el={el} />}
          {el.binding && <BindingChip binding={el.binding} />}
        </span>
        <span className="hidden max-w-[45%] truncate pt-px text-right font-sans text-xs text-ink-mid md:block">
          {el.short}
        </span>
      </div>
      {open && isChoice && <ChoiceRows node={node} />}
      {open &&
        node.children.map((child) => (
          <Row key={child.el.path} node={child} toggled={toggled} onToggle={onToggle} />
        ))}
    </>
  )
}

/** Expanded concrete properties of a choice element, one per allowed type. */
function ChoiceRows({ node }: { node: TreeNode }) {
  const { el, depth } = node
  return (
    <>
      {el.types.map((t, i) => (
        <div
          key={t.code}
          className="flex items-baseline gap-1.5 border-b border-line bg-inset/50 px-2 py-1"
          style={{ paddingLeft: `${0.5 + (depth + 1) * 1.25}rem` }}
        >
          <CornerDownRight size={11} className="self-center text-ink-faint" aria-hidden />
          <span className="font-medium">{el.choiceOf![i]}</span>
          <TypeLabel el={{ ...el, types: [t], choiceOf: undefined }} />
        </div>
      ))}
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
    <a
      href={`#el-${path}`}
      className="inline-flex items-center gap-1 text-xs text-t-complex hover:underline"
      title={`Contents defined at ${path}`}
    >
      <CornerDownRight size={11} aria-hidden />
      see {path}
    </a>
  )
}

function BindingChip({ binding }: { binding: NonNullable<ElementNode['binding']> }) {
  const label = binding.name ?? binding.url?.split('/').pop() ?? 'binding'
  return (
    <span
      className="rounded-sm border border-line bg-panel px-1 text-[10px] leading-4 text-ink-mid"
      title={`Binding: ${label} (${binding.strength})${binding.url ? `\n${binding.url}` : ''}`}
    >
      {label}
      <span className="text-ink-faint"> · {binding.strength}</span>
    </span>
  )
}
