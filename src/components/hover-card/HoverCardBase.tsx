/**
 * pdsls-style hover cards: portaled, interactive, nestable.
 *
 * - safePolygon keeps a card open while the cursor travels from trigger
 *   into the card body (open 300ms / close 150ms, matching pdsls).
 * - Placement is computed once per open and then locked, so the card never
 *   flips while the cursor moves or the page scrolls.
 * - FloatingTree makes nesting work with portaled cards: hovering a child
 *   card keeps every ancestor mounted.
 * - At most MAX_VISIBLE_DEPTH cards are visible in a chain; opening deeper
 *   hides the shallowest ancestor (pdsls's suppression behavior).
 */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  autoUpdate,
  flip,
  FloatingNode,
  FloatingPortal,
  FloatingTree,
  offset,
  safePolygon,
  shift,
  size,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useHover,
  useInteractions,
  type Placement,
} from '@floating-ui/react'
import { cn } from '~/lib/cn'

const OPEN_DELAY_MS = 300
const HIDE_DELAY_MS = 150
const MAX_VISIBLE_DEPTH = 3

/** Nesting depth of the surrounding card content; 0 = the page itself. */
const DepthContext = createContext(0)

interface Registry {
  register(id: string, depth: number): void
  unregister(id: string): void
  maxOpenDepth: number
}

const RegistryContext = createContext<Registry | null>(null)

/** One registry per top-level card chain, tracking open depths. */
function RegistryProvider({ children }: { children: ReactNode }) {
  const [openCards, setOpenCards] = useState<ReadonlyMap<string, number>>(new Map())
  const value = useMemo<Registry>(
    () => ({
      register: (id, depth) =>
        setOpenCards((prev) => new Map(prev).set(id, depth)),
      unregister: (id) =>
        setOpenCards((prev) => {
          const next = new Map(prev)
          next.delete(id)
          return next
        }),
      maxOpenDepth: Math.max(-1, ...openCards.values()),
    }),
    [openCards],
  )
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>
}

export interface HoverCardProps {
  /** Card body; rendered (and thus data-fetched) only while open. */
  content: ReactNode
  children: ReactNode
  className?: string
}

export function HoverCard(props: HoverCardProps) {
  const parentId = useFloatingParentNodeId()
  // Top-level trigger: start a tree + suppression registry for this chain.
  if (parentId == null) {
    return (
      <FloatingTree>
        <RegistryProvider>
          <HoverCardImpl {...props} />
        </RegistryProvider>
      </FloatingTree>
    )
  }
  return <HoverCardImpl {...props} />
}

function HoverCardImpl({ content, children, className }: HoverCardProps) {
  const depth = useContext(DepthContext)
  const registry = useContext(RegistryContext)
  const [open, setOpen] = useState(false)
  const [locked, setLocked] = useState<Placement | null>(null)
  const nodeId = useFloatingNodeId()
  const cardId = useId()

  const { refs, floatingStyles, context, placement } = useFloating({
    nodeId,
    open,
    onOpenChange: setOpen,
    placement: locked ?? 'bottom-start',
    middleware: [
      offset(6),
      // Only flip while unlocked; once open the placement holds steady.
      ...(locked ? [] : [flip({ padding: 8 })]),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, Math.min(availableHeight, 420))}px`
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })

  // Lock the first computed placement for the lifetime of this open.
  useEffect(() => {
    if (open) setLocked((prev) => prev ?? placement)
    else setLocked(null)
  }, [open, placement])

  useEffect(() => {
    if (!open || !registry) return
    registry.register(cardId, depth)
    return () => registry.unregister(cardId)
    // registry identity changes on every open-set change; keying on maxOpenDepth
    // alone would loop. register/unregister are stable in behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cardId, depth])

  const hover = useHover(context, {
    delay: { open: OPEN_DELAY_MS, close: HIDE_DELAY_MS },
    handleClose: safePolygon(),
    move: false,
  })
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, dismiss])

  // A chain of open cards sits at depths 0..maxOpenDepth; keep the deepest
  // MAX_VISIBLE_DEPTH visible and hide everything shallower.
  const suppressed =
    open && registry != null && depth <= registry.maxOpenDepth - MAX_VISIBLE_DEPTH

  return (
    <FloatingNode id={nodeId}>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn('cursor-context-menu', className)}
      >
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, visibility: suppressed ? 'hidden' : undefined }}
            {...getFloatingProps()}
            className="z-50 w-max max-w-md overflow-y-auto rounded-md border border-line-strong bg-paper text-ink shadow-lg shadow-black/10 dark:shadow-black/40"
          >
            <DepthContext.Provider value={depth + 1}>{content}</DepthContext.Provider>
          </div>
        </FloatingPortal>
      )}
    </FloatingNode>
  )
}
