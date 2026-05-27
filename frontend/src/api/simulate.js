const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TIMEOUT_MS = 10_000

async function fetchWithTimeout(path) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`API ${path} – ${res.status}`)
    return await res.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Zeitüberschreitung (10 s)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const fetchSimulateBaeume = ({ n_trees, area_m2, existing_coverage_pct = 0 }) =>
  fetchWithTimeout(
    `/api/simulate/baeume?n_trees=${n_trees}&area_m2=${area_m2}` +
    `&existing_coverage_pct=${existing_coverage_pct}`,
  )

export const fetchSimulateWasser = ({ area_m2, from_surface, to_surface }) =>
  fetchWithTimeout(`/api/simulate/wasser?area_m2=${area_m2}&from_surface=${from_surface}&to_surface=${to_surface}`)
