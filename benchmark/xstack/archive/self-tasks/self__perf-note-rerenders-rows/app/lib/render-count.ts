declare global {
  interface Window { __renderCounts?: Record<string, number> }
}

/** Perf instrumentation used by our profiling dashboards. Counts renders per component name. */
export function useRenderCount(name: string) {
  if (typeof window === 'undefined') return
  const counts = (window.__renderCounts = window.__renderCounts ?? {})
  counts[name] = (counts[name] ?? 0) + 1
}
