import type { ReactNode } from 'react'

/** The one sanctioned raw <a>: external destinations only. Internal
 * navigation must use TanStack's <Link> so it flows through router state. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}
