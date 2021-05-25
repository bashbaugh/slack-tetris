import { iterateMatrix, shuffleArray } from './util'
import { TetrisBlocksGrid, createGame, updateGame } from './render'
import cloneDeep from 'clone-deep'

const GRID_WIDTH = 11
const GRID_HEIGHT = 16

const SCORE_TABLE = {
  lineClears: {
    1: 40,
    2: 100,
    3: 300,
    4: 1200
  }
}

export type TetrominoName = 'I' | 'J' | 'L' | 'S' | 'Z' | 'T' | 'O'

// 0 is standard position as seen here <https://en.wikipedia.org/wiki/Tetromino#/media/File:Tetrominoes_with_Checkerboard_Squares.svg>
// 1 is rotated 90 degrees clockwise, 2 is 180, etc.
type Rotation = 0 | 1 | 2 | 3

interface Tetromino {
  type: TetrominoName
  position: [y: number, x: number] // dist from bottom, left of grid to bottom, left of tetrimino shape
  rotation: Rotation
  shape: boolean[][] // 2d MxM matrix
}

// - = blank space, # = fill, , = new row
// All shapes are represented by a 3x3 matrix, except I and O
const TETROMINO_SHAPES: Record<TetrominoName, string> = {
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
  const shapeRows = TETROMINO_SHAPES[type].split(',')
  // Take a row of - and # and convert it to an array of false and true:
  let shape: boolean[][] = shapeRows.map(row => Array.from(row).map(char => char === '#'))

  // Rotate the shape array clockwise `rotation` times by transposing and reversing the 2d matrix:
  for (let r=0; r<rotation; r++) {
    // const shapeSize = shape.length // MxM shape
    const transposedShape = shape[0].map((_, colInd) => shape.map(row => row[colInd]))
    const newShape = transposedShape.map(a => a.reverse())
    shape = newShape
  }

  // Reverse the shape so that row 0 is the bottom of the shape
  shape = shape.reverse()

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
  ts: string
  tetrominos: Tetromino[] // Array of pieces on grid. Current piece is last.
  nextPieces: TetrominoName[] // New tetrominos to place
  // client: WebClient
  loopInterval: NodeJS.Timeout
  startedAt: number
  endedAt: number
  level: number
  score: number
  gameOver: boolean

  constructor (cfg: NewGameConfig) { 
    this.tetrominos = []
    this.nextPieces = []
    this.cfg = cfg
    this.score = 0
    this.level = 1
  }

  /** Creates the game message and starts the loop */
  public async startGame () {
    this.ts = await createGame(this.cfg.channel)
    this.startedAt = new Date().getTime()
    // this.client = client

    this.loopInterval = setInterval(() => this.loop(), 2000)

    // Start game after 1 second
    setTimeout(() => this.update(), 1000)

    return this.ts
  }

  /** Moves active piece down one square, adds new pieces, checks for game over, etc. */
  private loop () {
    if (!this.tetrominos.length) {
      this.addPiece()
    } else {
      const didMoveDown = this.modifyActivePiece(piece => ({
        ...piece,
        position: [piece.position[0] - 1, piece.position[1]]
      }))

      if (!didMoveDown) { // Can't move down any further; finalize move and add a new piece
        this.addPiece()
      }
    }

    this.update()
  }

  /** Renders the grid and updates the game message */
  private update() {
    updateGame(this.cfg.channel, this.ts, {
      startedBy: this.cfg.user,
      blocks: this.renderBlockGrid().reverse(), // Render top-side up!,
      score: this.score,
      gameOver: this.gameOver,
      duration: (this.endedAt || new Date().getTime()) - this.startedAt
    })
  }

  /** Converts the tetromino array into a 2d matrix of piece types; and recomputes the score */
  private renderBlockGrid (tetriminos?: Tetromino[]): TetrisBlocksGrid {
    const grid: TetrisBlocksGrid = new Array(GRID_HEIGHT).fill(null).map(_ => new Array(GRID_WIDTH).fill(null))

    this.score = 0
    let totalLineClears = 0

    for (const piece of tetriminos || this.tetrominos) {
      // Check which cells this shape fills and fill the corresponding cells on the grid:
      iterateMatrix(piece.shape, (block, i, j) => {
        if (block) {
          grid[piece.position[0] + i][piece.position[1] + j] = piece.type
        }
      })

      let lineClears = 0
      for (const [i, row] of grid.entries()) {
        const lineClear = row.find(b => !b) === undefined // zero null places
        if (lineClear) {
          grid.splice(i, 1) // Remove cleared row
          lineClears++
        }
      }

      const lineClearsFromThisPiece = lineClears - totalLineClears

      this.score += (SCORE_TABLE.lineClears[lineClearsFromThisPiece] || 0) * this.level

      totalLineClears = lineClears
    }

    return grid // Render top-side up!
  }

  /** Creates a new active piece and spawns it at the top */
  private addPiece () {
    if (!this.nextPieces.length) {
      const newSet = shuffleArray(Object.keys(TETROMINO_SHAPES) as TetrominoName[])
      this.nextPieces = this.nextPieces.concat(newSet)
    }

    const nextPieceType = this.nextPieces.shift()
    const nextPiece: Tetromino = {
      ...getTetromino(nextPieceType, 0),
      position: [GRID_HEIGHT - 4, Math.ceil(GRID_WIDTH / 2) - 2]
    }

    if (!this.isValidPosition(nextPiece)) { // Can't place any more pieces; game over!
      this.endGame()
      return
    }

    this.tetrominos.push(nextPiece)
  }

  /** Checks the position of a piece to make sure it doens't overlap with another piece, or the walls */
  private isValidPosition (piece: Tetromino): boolean {
    const grid = this.renderBlockGrid() // Grid of existing pieces
    const shapeSize = piece.shape.length

    const foundConflict = iterateMatrix(piece.shape, (block, i, j) => {
      // A filled spot is going below the grid; this is invalid:
      if (block && piece.position[0] + i < 0) return true
      // A filled spot is passing the walls:
      if (block && piece.position[1] + j < 0 || piece.position[1] + j > GRID_WIDTH - 1) return true
      // If the shape wants to fill a cell that's already filled on the grid, there's a conflict:
      if (block && grid[piece.position[0] + i][piece.position[1] + j]) return true
    })

    return !foundConflict
  }

  /** Accepts a cb fn which is used to edit the piece; then checks validity of the new position and rejects it if it's invalid */
  private modifyActivePiece (getNewPiece: (piece: Tetromino) => Tetromino, skipUpdate?: boolean) {
    const oldPiece = this.tetrominos.pop()
    const newPiece = getNewPiece(cloneDeep(oldPiece))

    if (this.isValidPosition(newPiece)) {
      this.tetrominos.push(newPiece)
      if (!skipUpdate) this.update()
      return true
    }
    else this.tetrominos.push(oldPiece) // Ignore the move if it's not valid
    return false
  }

  /** Rotates active piece clockwise */
  public rotatePiece () {
    this.modifyActivePiece(piece => ({
      ...piece,
      ...getTetromino(piece.type, piece.rotation === 3 ? 0 : piece.rotation + 1 as Rotation)
    }))
  }

  /** Moves the active piece left/right */
  public movePiece(direction: 'left' | 'right') {
    this.modifyActivePiece(piece => {
      const newX = direction === 'left' ? piece.position[1] - 1 : piece.position[1] + 1
      return {
        ...piece,
        position: [piece.position[0], newX] as [number, number]
      }
    })
  }
  
  /** Drops the active piece into place */
  public dropPiece() {
    let continueMovingDown = true
    while (continueMovingDown) {
      continueMovingDown = this.modifyActivePiece(piece => ({
        ...piece,
        position: [piece.position[0] - 1, piece.position[1]]
      }), true)
    }
    this.update()
  }

  /** Stops the game */
  public endGame() {
    clearInterval(this.loopInterval)
    this.gameOver = true
    this.endedAt = new Date().getTime() 
    this.update()
  }
}
