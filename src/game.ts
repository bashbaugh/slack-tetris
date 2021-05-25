import { iterateMatrix, shuffleArray } from './util'
import { TetrisBlocksGrid, createGame, updateGame } from './render'
import cloneDeep from 'clone-deep'

const GRID_WIDTH = 10
const GRID_HEIGHT = 16

const SCORE_TABLE = {
  lineClears: {
    1: 40,
    2: 100,
    3: 300,
    4: 1200
  },
  pointsPerLineSkipped: 1
}

const LEVELS: [scoreThreshold: number, intervalDuration: number][] = [
  [0, 1600],
  [40, 1200],
  [200, 1000],
  [500, 800],
  [1000, 600],
  [1500, 400],
  [3000, 200],
]

export type TetrominoName = 'I' | 'J' | 'L' | 'S' | 'Z' | 'T' | 'O' | 'FILL'

// 0 is standard position as seen here <https://en.wikipedia.org/wiki/Tetromino#/media/File:Tetrominoes_with_Checkerboard_Squares.svg>
// 1 is rotated 90 degrees clockwise, 2 is 180, etc.
type Rotation = 0 | 1 | 2 | 3

interface Tetromino {
  type: 'tetromino'
  name: TetrominoName
  position: [y: number, x: number] // dist from bottom, left of grid to bottom, left of tetrimino shape
  rotation: Rotation
  shape: boolean[][] // 2d MxM matrix
}

interface LineClear {
  type: 'clear'
  row: number
}

interface LineFill {
  type: 'fill'
}

type Piece = Tetromino | LineClear | LineFill

// - = blank space, # = fill, , = new row
// All shapes are represented by a 3x3 matrix, except I and O
const TETROMINO_SHAPES: Record<Exclude<TetrominoName, 'FILL'>, string> = {
  I: '--#-,--#-,--#-,--#-',
  O: '##,##',
  T: '---,###,-#-',
  S: '---,-##,##-',
  L: '#--,#--,##-',
  J: '--#,--#,-##',
  Z: '---,##-,-##',
}

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
    type: 'tetromino',
    name: type,
    rotation,
    shape
  }
}

export type GameMode = 'open' | '1p' | '2p'

interface NewGameConfig {
  channel: string,
  user: string,
  mode?: GameMode
}

export class Game {
  cfg: NewGameConfig
  ts: string
  private pieces: Piece[] // Array of pieces and other events such as line clears. Current piece is last.
  private nextTetrominoes: TetrominoName[] // New tetrominos to place
  private loopInterval: NodeJS.Timeout
  startedAt: number
  endedAt: number
  score: number
  bonusPoints: number // Points from dropping blocks early, etc.
  gameOver: boolean
  private lastLevel: number

  constructor (cfg: NewGameConfig) { 
    this.pieces = []
    this.nextTetrominoes = []
    this.cfg = cfg
    if (!this.cfg.mode) this.cfg.mode = 'open'
    this.score = 0
    this.bonusPoints = 0
  }

  /** Creates the game message and starts the loop */
  public async startGame () {
    this.ts = await createGame(this.cfg.channel)
    this.startedAt = new Date().getTime()
    // this.client = client

    this.loopInterval = setInterval(() => this.loop(), LEVELS[0][1])

    // Start game after 1 second
    setTimeout(() => this.update(), 1000)

    return this.ts
  }

  /** Moves active piece down one square, adds new pieces, etc. */
  private loop () {
    if (!this.pieces.length) {
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

    // If we are on a new level, cancel the loop interval and set a new one with a shorter duration
    if (this.level > this.lastLevel) {
      clearInterval(this.loopInterval)
      this.loopInterval = setInterval(() => this.loop(), LEVELS[this.level][1])
    }

    this.lastLevel = this.level

    this.update()
  }

  /** Renders the grid and updates the game message */
  private update() {
    updateGame(this.cfg.channel, this.ts, {
      startedBy: this.cfg.user,
      mode: this.cfg.mode,
      blocks: this.renderBlockGrid().reverse(), // Render top-side up!,
      score: this.score,
      gameOver: this.gameOver,
      duration: (this.endedAt || new Date().getTime()) - this.startedAt,
      nextPiece: this.nextTetrominoes[0]
    })
  }

  /** Converts the tetromino array into a 2d matrix of piece types; and recomputes the score */
  private renderBlockGrid (): TetrisBlocksGrid {
    const grid: TetrisBlocksGrid = new Array(GRID_HEIGHT).fill(null).map(_ => new Array(GRID_WIDTH).fill(null))

    this.score = 0

    for (const [pieceIndex, piece] of this.pieces.entries()) {
      const rowsThisPieceFills = []
      const isActiveTetromino = this.pieces.length - 1 === pieceIndex

      // Check which cells this shape fills and fill the corresponding cells on the grid:
      if (piece.type === 'tetromino') {
        iterateMatrix(piece.shape, (block, i, j) => {
          if (block) {
            rowsThisPieceFills.push(piece.position[0] + i)
            grid[piece.position[0] + i][piece.position[1] + j] = piece.name
          }
        })
      } 

      if (piece.type === 'clear') {
        grid.splice(piece.row, 1) // Remove cleared row
        grid.push(new Array(GRID_WIDTH).fill(null)) // Add new empty row at top
      }

      if (piece.type === 'fill') {
        grid.pop() // Remove cleared row
        grid.unshift(new Array(GRID_WIDTH).fill('FILL')) // Add new empty row at top
      }


      let lineClears = 0
      for (const [rowIndex, row] of grid.entries()) {
        const lineClear = row.find(b => !b) === undefined // zero null places
        
        if (lineClear && (!isActiveTetromino || !rowsThisPieceFills.includes(rowIndex))) {
          grid.splice(rowIndex, 1) // Remove cleared row
          grid.push(new Array(GRID_WIDTH).fill(null)) // Add new empty row at top
          lineClears++
        }
      }

      this.score += (SCORE_TABLE.lineClears[lineClears] || 0) * this.lastLevel
    }

    this.score += this.bonusPoints // Include bonus points earned over course of game

    return grid // Render top-side up!
  }

  public get level (): number {
    return LEVELS.reduce((lvl, [threshold]) => lvl += this.score >= Number(threshold) ? 1 : 0, 0)
  }

  /** Creates a new active piece and spawns it at the top */
  private addPiece () {
    if (this.nextTetrominoes.length < 2) { // Running out of new pieces; add 7 more
      const newSet = shuffleArray(Object.keys(TETROMINO_SHAPES) as TetrominoName[])
      this.nextTetrominoes = this.nextTetrominoes.concat(newSet)
    }

    const nextPieceType = this.nextTetrominoes.shift()
    const nextPiece: Tetromino = {
      ...getTetromino(nextPieceType, 0),
      position: [GRID_HEIGHT - 4, Math.ceil(GRID_WIDTH / 2) - 2]
    }

    if (!this.isValidPosition(nextPiece)) { // Can't place any more pieces; game over!
      this.endGame()
      return
    }

    this.pieces.push(nextPiece)
  }

  /**  */
  private updateScore () {

  }

  /** Checks the position of a piece to make sure it doens't overlap with another piece, or the walls */
  private isValidPosition (piece: Tetromino): boolean {
    const grid = this.renderBlockGrid() // Grid of existing pieces
    const shapeSize = piece.shape.length

    const foundConflict = iterateMatrix(piece.shape, (block, i, j) => {
      // A filled spot is going below the grid; this is invalid:
      if (block && piece.position[0] + i < 0) return true
      // A filled spot is passing the walls:
      if (block && (piece.position[1] + j < 0 || piece.position[1] + j > GRID_WIDTH - 1)) return true
      // If the shape wants to fill a cell that's already filled on the grid, there's a conflict:
      if (block && grid[piece.position[0] + i][piece.position[1] + j]) return true
    })

    return !foundConflict
  }

  /** Accepts a cb fn which is used to edit the piece; then checks validity of the new position and rejects it if it's invalid */
  private modifyActivePiece (getNewPiece: (piece: Tetromino) => Tetromino, skipUpdate?: boolean) {
    const oldPiece = this.pieces.pop()
    const newPiece = getNewPiece(cloneDeep(oldPiece))

    if (this.isValidPosition(newPiece)) {
      this.pieces.push(newPiece)
      if (!skipUpdate) this.update()
      return true
    }
    else this.pieces.push(oldPiece) // Ignore the move if it's not valid
    return false
  }

  /** Rotates active piece clockwise */
  public rotatePiece () {
    this.modifyActivePiece(piece => ({
      ...piece,
      ...getTetromino(piece.name, piece.rotation === 3 ? 0 : piece.rotation + 1 as Rotation)
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

      if (continueMovingDown) this.bonusPoints += SCORE_TABLE.pointsPerLineSkipped * this.level
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
