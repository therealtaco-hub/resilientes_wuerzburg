import { apiFetch } from './client'
export const fetchLst = () => apiFetch('/api/lst')
export const fetchLstDelta = () => apiFetch('/api/lst/delta')
