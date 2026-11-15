// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState, useCallback, useMemo } from 'react'
import { showToast } from '../utils/toast'
import { useBlogContext } from '../context/BlogContext'

const BOARD_SIZE = 15
const WIN_CONDITION = 5

const Game: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const [board, setBoard] = useState<Array<Array<number>>>(
    Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(0))
  )
  const [isBlackTurn, setIsBlackTurn] = useState(true)
  const [winner, setWinner] = useState<number>(0)
  const [moves, setMoves] = useState<string[]>([])
  const { setBlogs, setSelectedBlog } = useBlogContext()

  const checkWin = useCallback(
    (row: number, col: number, player: number) => {
      const directions = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]

      for (const [dx, dy] of directions) {
        let count = 1

        for (let i = 1; i < WIN_CONDITION; i++) {
          const newRow = row + dx * i
          const newCol = col + dy * i
          if (
            newRow < 0 ||
            newRow >= BOARD_SIZE ||
            newCol < 0 ||
            newCol >= BOARD_SIZE ||
            board[newRow][newCol] !== player
          )
            break
          count++
        }

        for (let i = 1; i < WIN_CONDITION; i++) {
          const newRow = row - dx * i
          const newCol = col - dy * i
          if (
            newRow < 0 ||
            newRow >= BOARD_SIZE ||
            newCol < 0 ||
            newCol >= BOARD_SIZE ||
            board[newRow][newCol] !== player
          )
            break
          count++
        }

        if (count >= WIN_CONDITION) return true
      }
      return false
    },
    [board]
  )

  const handleClick = useCallback(
    (row: number, col: number) => {
      if (board[row][col] !== 0 || winner !== 0) return

      const newBoard = board.map((row) => [...row])
      const currentPlayer = isBlackTurn ? 1 : 2
      newBoard[row][col] = currentPlayer

      const newMove = `${isBlackTurn ? 'Black' : 'White'}(${row},${col})`
      setMoves((prevMoves) => [...prevMoves, newMove])

      if (checkWin(row, col, currentPlayer)) {
        setWinner(currentPlayer)
        showToast('Congratulations!', 2000, { fontSize: 50 })
      }

      setBoard(newBoard)
      setIsBlackTurn(!isBlackTurn)
    },
    [board, isBlackTurn, winner, checkWin]
  )

  const handlePostGameRecords = () => {
    const currentDate = new Date().toISOString().split('T')[0]
    const currentTime = new Date().toTimeString().split(' ')[0]
    const newBlogTitle = `Game-${currentDate}-${currentTime}`
    const newBlogContent = `# ${
      winner === 1 ? 'Black' : 'White'
    } is Winner!\n\`\`\`game\n${moves.join(';\n')};\n\`\`\``

    setBlogs((prevBlogs) => [...prevBlogs, { title: newBlogTitle, detail: newBlogContent }])
    setSelectedBlog(newBlogTitle)
    navigate('/')
  }

  const boardElements = useMemo(() => {
    return board.map((row, rowIndex) => (
      <div key={rowIndex} style={{ display: 'flex' }}>
        {row.map((cell, colIndex) => (
          <div
            key={`${rowIndex}-${colIndex}`}
            className={`chess-pos-${rowIndex}-${colIndex} ${
              cell === 1 ? 'chess-black' : cell === 2 ? 'chess-white' : ''
            }`}
            onClick={() => handleClick(rowIndex, colIndex)}
            style={{
              width: '40px',
              height: '40px',
              border: '1px solid #000',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: cell === 0 && winner === 0 ? 'pointer' : 'default',
              position: 'relative',
            }}
          >
            {cell !== 0 && (
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: cell === 1 ? 'black' : 'white',
                  border: cell === 2 ? '1px solid #ccc' : 'none',
                }}
              />
            )}
          </div>
        ))}
      </div>
    ))
  }, [board, handleClick])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
      }}
    >
      <h1>Hello Game</h1>
      <div
        style={{
          marginBottom: '20px',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#333',
        }}
      >
        {winner === 0
          ? `${isBlackTurn ? 'Black' : 'White'}'s Turn`
          : `${winner === 1 ? 'Black' : 'White'} Wins!`}
      </div>
      <div
        style={{
          backgroundColor: '#e6c88c',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        {boardElements}
      </div>
      {winner !== 0 && (
        <button
          onClick={handlePostGameRecords}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '18px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Post Game Records
        </button>
      )}
    </div>
  )
}

export default Game
