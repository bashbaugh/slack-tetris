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

const BLANK_EMOJI = ':blank:'
const INVISIBLE_CHARACTER = '⁣' // We can use this to force emojis down to their smaller size

type TetrisBlocks = (TetrominoName | null)[][]

export function renderBlockGrid(blocks: TetrisBlocks): string {
  return blocks.reduce((str, line) => str + '\n' + line.map(b => b ? blockEmoji[b] : BLANK_EMOJI).join(''), '') + INVISIBLE_CHARACTER
}

interface GameRenderData {
  startedBy: string // user ID
  blocks?: TetrisBlocks
}

export function renderGameBlocks(game: GameRenderData): { blocks: any, text: string } {
  return {
    text: 'Tetris game',
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `<@${game.startedBy}> started a Tetris game`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `${renderBlockGrid(game.blocks || [])}`
        }
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": ":repeat:",
              "emoji": true
            },
            "action_id": "btn_rotate"
          },
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": ":arrow_left:",
              "emoji": true
            },
            "action_id": "btn_left"
          },
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": ":arrow_right:",
              "emoji": true
            },
            "action_id": "btn_right"
          },
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": ":arrow_down:",
              "emoji": true
            },
            "action_id": "btn_down"
          }
        ]
      }
    ]
  }
}