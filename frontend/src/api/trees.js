import { apiFetch } from './client'
export const fetchTrees = () => apiFetch('/api/trees')
