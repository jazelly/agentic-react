import type { Board } from './data'

export function BoardCard({ board }: { board: Board }) {
  return (
    <li style={{ listStyle: 'none', borderRadius: 8, padding: 12, background: board.color, color: 'white', width: 180 }}>
      <strong>{board.name}</strong>
      <div style={{ fontSize: 12 }}>{board.cards} cards</div>
    </li>
  )
}
