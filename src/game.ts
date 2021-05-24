import { App, SayFn, SlashCommand } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { renderGameBlocks } from './render'

const GRID_WIDTH = 10
const GRID_HEIGHT = 20

export type TetrominoName = 'I' | 'J' | 'L' | 'S' | 'Z' | 'T' | 'O'

// 0 is standard position as seen here <https://en.wikipedia.org/wiki/Tetromino#/media/File:Tetrominoes_with_Checkerboard_Squares.svg>
// 1 is rotated 90 degrees clockwise, 2 is 180, etc.
type Rotation = 0 | 1 | 2 | 3

interface Tetromino {
  type: TetrominoName
  position: [number, number] // dist from bottom, left of grid to bottom, left of tetrimino shape
  rotation: Rotation
  shape: boolean[][] // 2d MxM matrix
}

// - = blank space, # = fill, , = new row
// All shapes are represented by a 3x3 matrix, except I and O
const tetrominoShapeStrings: Record<TetrominoName, string> = {
  I: '--#-,--#-,--#-,--#-',
  O: '##,##',
  T: '---,###,-#-',
  S: '---,-##,##-',
  L: '#--,#--,##-',
  J: '--#,--#,-##',
  Z: '---,##-,-##',
}

// const tetriminoShapes: Record<TetriminoName, boolean[][]> = Object.fromEntries(
//   Object.entries(tetriminoShapeStrings)
//     .map(([name, shape]) => {
//       const rows = shape.split(',')
//       // Take a row of - and # and convert it to an array of false and true
//       return [name, rows.map(row => Array.from(row).map(char => char === '#'))]
//     })
// ) as any

const getTetromino = (type: TetrominoName, rotation: Rotation): Omit<Tetromino, 'position'> => {
  const shapeRows = tetrominoShapeStrings[type].split(',')
  // Take a row of - and # and convert it to an array of false and true:
  let shape: boolean[][] = shapeRows.map(row => Array.from(row).map(char => char === '#'))

  // Rotate the shape array clockwise `rotation` times by transposing and reversing the 2d matrix:
  for (let r=0; r<rotation; r++) {
    // const shapeSize = shape.length // MxM shape
    const transposedShape = shape[0].map((_, colInd) => shape.map(row => row[colInd]))
    const newShape = transposedShape.map(a => a.reverse())
    shape = newShape
  }

  return {
    type,
    rotation,
    shape
  }
}

interface NewGameConfig {
  channel: string,
  user: string
}

export class Game {
  cfg: NewGameConfig
  timestamp: string
  tetrominos: Tetromino[]

  constructor (cfg: NewGameConfig) { 
    this.tetrominos = []
    this.cfg = cfg
  }

  public async startGame (client: WebClient) {
    const message = await client.chat.postMessage({
      channel: this.cfg.channel,
      ...renderGameBlocks({
        startedBy: this.cfg.user,
      })
    })

    this.timestamp = message.ts

    setInterval(this.loop, 1000)

    return this.timestamp
  }

  public loop () {
    
  }

  public renderGrid () {

  }

  public rotatePiece () {

  }

  public movePiece(direction: 'left' | 'right' | 'down') {

  }
}
