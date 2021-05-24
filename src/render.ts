import { TetrominoName } from './game'

const blockEmoji: Record<TetrominoName, string> = {
  Z: ':100000:', // red
  S: ':001000:', // green
  J: ':000010:', // blue
  I: ':001009:', // cyan
  L: ':090300:', // orange
  O: ':090900:', // yellow - this is the square block
  T: ':050109:', // purple
}

export function renderBlockGrid(blocks: TetrominoName[][]): string {
  return 'aa' + blocks.reduce((str, line) => str + '\n' + line.map(b => blockEmoji[b]).join(''), '') + 'aa'
}
