import { TetrominoName } from './game'
import { bot } from '.'

const BLOCK_EMOJI: Record<TetrominoName, string> = {
  Z: ':100000:', // red
  S: ':001000:', // green
  J: ':000010:', // blue
  I: ':001009:', // cyan
  L: ':090300:', // orange
  O: ':090900:', // yellow
  T: ':050109:', // purple
}

const BLANK_EMOJI = ':blank:'
const INVISIBLE_CHARACTER = '⁣' // We can use this to force emojis down to their smaller size if needed.

const GAME_BUTTONS = {
  'btn_rotate': ':repeat:',
  'btn_left': ':arrow_left:',
  'btn_right': ':arrow_right:',
  'btn_down': ':arrow_down:'
}

export type GameButtonAction = keyof typeof GAME_BUTTONS

export type TetrisBlocksGrid = (TetrominoName | null)[][]

const renderBlockGrid = (blocks: TetrisBlocksGrid) =>
  blocks.reduce((str, line) => str + '\n' + line.map(b => b ? BLOCK_EMOJI[b] : BLANK_EMOJI).join(''), '') + INVISIBLE_CHARACTER

export interface GameMessageData {
  startedBy: string // user ID
  blocks?: TetrisBlocksGrid
}

function renderGameBlocks(game: GameMessageData): { blocks: any, text: string } {
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
        "elements": Object.entries(GAME_BUTTONS).map(([action_id, text]) => ({
          "type": "button",
          "text": {
            "type": "plain_text",
            "emoji": true,
            text,
          },
          action_id
        }))
      }
    ]
  }
}

const splashText = ` 
\`\`\`
 _____   _____   _____   _____    _   _____  
|_   _| | ____| |_   _| |  _  \\  | | /  ___/ 
  | |   | |__     | |   | |_| |  | | | |___  
  | |   |  __|    | |   |  _  /  | | \\___  \\ 
  | |   | |___    | |   | | \\ \\  | |  ___| | 
  |_|   |_____|   |_|   |_|  \\_\\ |_| /_____/ 
\`\`\` 

:parrotwave1: :parrotwave2: :parrotwave3: :parrotwave4: :parrotwave5: :parrotwave6: :parrotwave7:`

export async function createGame (channel: string): Promise<string> {
  const msg = await bot.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    text: splashText
  })

  return msg.ts
}

export async function updateGame (channel: string, ts: string, game: GameMessageData) {
  await bot.client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts,
    ...renderGameBlocks(game)
  })
}