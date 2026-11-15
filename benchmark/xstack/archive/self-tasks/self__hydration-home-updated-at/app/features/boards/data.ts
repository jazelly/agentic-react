export interface Board { id: number; name: string; color: string; cards: number }

export const boards: Board[] = [
  { id: 1, name: 'Product roadmap', color: '#0ea5e9', cards: 12 },
  { id: 2, name: 'Marketing launch', color: '#f97316', cards: 7 },
  { id: 3, name: 'Hiring pipeline', color: '#22c55e', cards: 4 },
  { id: 4, name: 'Bug triage', color: '#ef4444', cards: 19 },
]
