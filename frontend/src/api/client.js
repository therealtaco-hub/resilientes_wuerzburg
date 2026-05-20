// VITE_API_URL wird in .env gesetzt; fällt auf localhost:8000 für lokale Entwicklung zurück.
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`API ${path} – ${res.status}`)
  return res.json()
}
