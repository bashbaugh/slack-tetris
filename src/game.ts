import { iterateMatrix, shuffleArray } from './util'
import { TetrisBlocksGrid, createGame, updateGame } from './render'
import cloneDeep from 'clone-deep'
import { onGameEnd } from './bot'

const GRID_WIDTH = 10
const GRID_HEIGHT = 16

const SCORE_TABLE = {
  lineClears: {
    1: 40,
    2: 100,
    3: 300,
    4: 1200
  },
  pointsPerRowSkipped: 1
}

// Ex: after a score of 40, there will be a 1200ms delay between loops
const LEVELS: [scoreThreshold: number, intervalDuration: number][] = [
  [0, 1400],
  [40, 1000],
  [200, 900],
  [800, 800],
  [2000, 600],
  [20000, 400],
  [50000, 200],
  [500000, 50],
]

export type TetrominoName = 'I' | 'J' | 'L' | 'S' | 'Z' | 'T' | 'O'

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

export interface NewGameConfig {
  channel: string,
  user: string,
  mode?: GameMode
  matchId?: string
  thread_ts?: string
  startDelay?: number
}

export class Game {
  cfg: NewGameConfig
  ts: string
  opponent: Game

  private pieces: Piece[] // Array of pieces and other events such as line clears. Latest piece is last.
  private activePiece: Tetromino
  private nextTetrominoes: TetrominoName[] // New tetrominos to place. Next is first.
  private hold?: TetrominoName
  private hasAlreadyHeld: boolean
  private fillSlot: number // Where is the slot placed in filler rows?
  private lastLevel: number
  private loopInterval: NodeJS.Timeout

  startedAt: number
  endedAt: number
  score: number
  gameOver: boolean

  constructor (cfg: NewGameConfig) { 
    this.pieces = []
    this.nextTetrominoes = []
    this.cfg = cfg
    if (!this.cfg.mode) this.cfg.mode = 'open'
    this.score = 0

    // Between the first and last rows (exclusive)
    this.fillSlot = Math.floor(Math.random() * (GRID_WIDTH - 2) + 1)
  }

  /** Creates the game message and starts the loop */
  public async startGame () {
    this.ts = await createGame(this.cfg.channel, this.cfg.thread_ts)
    
    setTimeout(() => {
      this.loopInterval = setInterval(() => this.loop(), this.levelDelay)
    }, this.cfg.startDelay || 0)

    // Start game after 1 second
    setTimeout(() => this.update(), 1000)

    console.log(`Game starting in ${this.cfg.channel}`)

    return this.ts
  }

  /** Moves active tetromino down one square, adds new pieces, etc. */
  private loop () {
    if (!this.activePiece) { // game not started
      this.startedAt = new Date().getTime()
      this.addPiece()
    } else {
      const didMoveDown = this.updateActivePiece(piece => ({
        ...piece,
        position: [piece.position[0] - 1, piece.position[1]]
      }), true)

      if (!didMoveDown) { // Can't move down any further: finalize move, update score, and add a new piece
        this.addPiece() // Must finalize move first so that it can be properly cleared
        this.clearLinesAndUpdateScore()
        this.hasAlreadyHeld = false
      }
    }

    // If we are on a new level, cancel the loop interval and set a new one with a shorter duration
    if (this.level > this.lastLevel) {
      clearInterval(this.loopInterval)
      this.loopInterval = setInterval(() => this.loop(), this.levelDelay)
    }

    this.lastLevel = this.level

    this.update()
  }

  /** Renders the grid and updates the game message */
  private update() {
    updateGame(this.cfg.channel, this.ts, {
      startedBy: this.cfg.user,
      mode: this.cfg.mode,
      blocks: this.renderBlockGrid(true).reverse(), // Render top-side up!,
      score: this.score,
      level: this.level,
      gameOver: this.gameOver,
      duration: (this.endedAt || new Date().getTime()) - this.startedAt || 0,
      nextPiece: this.nextTetrominoes[0],
      heldPiece: this.hold,
      startingIn: !this.startedAt && this.cfg.startDelay
    })
  }

  /** Converts the piece array into a 2d matrix of blocks.  */
  private renderBlockGrid (includeActive = true): TetrisBlocksGrid {
    const grid: TetrisBlocksGrid = new Array(GRID_HEIGHT).fill(null).map(_ => new Array(GRID_WIDTH).fill(null))

    const pieces = this.pieces.concat(includeActive && this.activePiece ? [this.activePiece] : [])

    for (const [pieceIndex, piece] of pieces.entries()) {
      // Check which cells this shape fills and fill the corresponding cells on the grid:
      if (piece.type === 'tetromino') {
        iterateMatrix(piece.shape, (block, i, j) => {
          if (block) {
            grid[piece.position[0] + i][piece.position[1] + j] = piece.name
          }
        })
      } 

      if (piece.type === 'clear') {
        grid.splice(piece.row, 1) // Remove cleared row
        grid.push(new Array(GRID_WIDTH).fill(null)) // Add new empty row at top
      }

      if (piece.type === 'fill') {
        grid.pop() // Remove row at top
        grid.unshift(new Array(GRID_WIDTH).fill('FILL')) // Add new filled row at bottom
        grid[0][this.fillSlot] = null // Leave a slot in the fill so that it can be cleared
      }
    }

    return grid
  }

  /** Get level, computed from current score */
  public get level (): number {
    return LEVELS.reduce((lvl, [threshold]) => lvl += this.score >= Number(threshold) ? 1 : 0, 0)
  }

  /** Get current delay between loops  */
  private get levelDelay (): number {
    return LEVELS[this.level - 1][1]
  }

  /** Creates a new active piece and spawns it at the top */
  private addPiece (name?: TetrominoName) {
    if (this.nextTetrominoes.length < 3) { // Running out of new pieces; add 7 more
      const newSet = shuffleArray(Object.keys(TETROMINO_SHAPES) as TetrominoName[])
      this.nextTetrominoes = this.nextTetrominoes.concat(newSet)
    }

    const nextPieceType = name || this.nextTetrominoes.shift()
    const nextPiece = getTetromino(nextPieceType, 0) as Tetromino
    nextPiece.position = [GRID_HEIGHT - nextPiece.shape.length, Math.ceil(GRID_WIDTH / 2) - 2]

    if (!this.isValidPosition(nextPiece)) { // Can't place any more pieces; game over!
      this.endGame()
      return
    }

    if (this.activePiece) this.pieces.push(this.activePiece)
    this.activePiece = nextPiece
  }

  /** Checks for line clears and increases the score if needed */
  private clearLinesAndUpdateScore () {
    const grid = this.renderBlockGrid(false)

    const lineClears = grid.reduce((fullRows, row, rowIndex) => {
      const cleared = row.find(b => !b) === undefined // No empty places found
      const isFillClear = row[0] === 'FILL'

      // The user has cleared this row!!!
      if (cleared) this.pieces.push({
        type: 'clear',
        // Subtract number of rows that are already cleared, because they (should) no longer exist when this clear happens:
        row: rowIndex - fullRows
      })

      // Fill clears don't count :(
      return fullRows + ((cleared && !isFillClear) ? 1 : 0)
    }, 0)

    this.score += (SCORE_TABLE.lineClears[lineClears] || 0) * this.lastLevel

    if (this.opponent) this.opponent.addFillLines(lineClears)
  }

  /** Add fill lines to the bottom of this game's grid. Used by opponent game when they clear a line. */
  public addFillLines (num = 1) {
    for (let i = 0; i < num; i++) {
      this.pieces.push({
        type: 'fill',
      })
    }
    // Also need to move active piece up to make sure it doesn't overlap
    this.activePiece.position[0] = this.activePiece.position[0] + num
  }

  /** Checks the position of a piece to make sure it doens't overlap with another piece, or the walls */
  private isValidPosition (piece: Tetromino): boolean {
    const grid = this.renderBlockGrid(false) // Grid of pieces, excluding active piece

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

  /** Accepts a function argument which is called to edit the piece; then checks validity of the new position and rejects it if it's invalid */
  private updateActivePiece (getNewPiece: (piece: Tetromino) => Tetromino, skipUpdate?: boolean) {
    const newPiece = getNewPiece(cloneDeep(this.activePiece))

    if (this.isValidPosition(newPiece)) {
      this.activePiece = newPiece
      if (!skipUpdate) this.update()
      return true
    }
    return false // Ignore the move if it's not valid
  }

  /** Rotates active piece clockwise */
  public rotatePiece () {
    this.updateActivePiece(piece => ({
      ...piece,
      ...getTetromino(piece.name, piece.rotation === 3 ? 0 : piece.rotation + 1 as Rotation)
    }))
  }

  /** Moves the active piece left/right */
  public movePiece(direction: 'left' | 'right') {
    this.updateActivePiece(piece => {
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
      continueMovingDown = this.updateActivePiece(piece => ({
        ...piece,
        position: [piece.position[0] - 1, piece.position[1]]
      }), true)

      if (continueMovingDown) this.score += SCORE_TABLE.pointsPerRowSkipped * this.level
    }
    this.update()
  }

  /** Hold the current active piece  */
  public holdPiece() {
    if (this.hasAlreadyHeld) return // Can only hold once per piece

    // Take new tetromino type from hold or next stack, and add current type to hold.
    const newType = this.hold || this.nextTetrominoes.shift()
    this.hold = this.activePiece.name

    // Remove the current aative piece and add the held one.
    this.activePiece = null
    this.addPiece(newType)

    this.hasAlreadyHeld = true
    this.update()
  }

  /** Stops the game */
  public endGame() {
    onGameEnd(this)
    clearInterval(this.loopInterval)
    this.gameOver = true
    this.endedAt = new Date().getTime()
    this.update()
  }
}
