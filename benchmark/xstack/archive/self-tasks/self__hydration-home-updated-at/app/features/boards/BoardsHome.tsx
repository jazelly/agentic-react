import { BoardCard } from './BoardCard'
import { boards } from './data'
import { UpdatedAt } from './UpdatedAt'

export function BoardsHome() {
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1>Boards</h1>
        <UpdatedAt />
      </div>
      <ul style={{ display: 'flex', gap: 12, padding: 0, flexWrap: 'wrap' }}>
        {boards.map((b) => <BoardCard key={b.id} board={b} />)}
      </ul>
    </main>
  )
}
