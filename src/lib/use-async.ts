import { useEffect, useState } from 'react'

interface AsyncState<T> {
  data?: T
  error?: unknown
  loading: boolean
}

/**
 * Resolve a promise-returning function keyed by `key`. Backed by the schema
 * module's promise cache, so repeat hovers resolve instantly.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true })
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState({ error, loading: false }),
    )
    return () => {
      alive = false
    }
    // fn is intentionally keyed by `key` alone; callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
