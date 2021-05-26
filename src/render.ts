import { GameMode, TetrominoName } from './game'
import { bot } from '.'
import { formatMilliseconds } from './util'

const BLOCK_EMOJI: Record<TetrominoName | 'FILL', string> = {
  Z: ':tetris-block-z:', // red
  S: ':tetris-block-s:', // green
  J: ':tetris-block-j:', // blue
  I: ':tetris-block-i:', // cyan
  L: ':tetris-block-l:', // orange
  O: ':tetris-block-o:', // yellow
  T: ':tetris-block-t:', // purple
  FILL: ':tetris-block-gray:',
}

const TETROMINO_EMOJI: Record<TetrominoName, string> = {
  Z: ':tetromino-z:', // red
  S: ':tetromino-s:', // green
  J: ':tetromino-j:', // blue
  I: ':tetromino-i:', // cyan
  L: ':tetromino-l:', // orange
  O: ':tetromino-o:', // yellow
  T: ':tetromino-t:', // purple
}

const BLANK_EMOJI = ':blank:'
const INVISIBLE_CHARACTER = '⁣' // We can use this to force emojis down to their smaller size if needed.

const WALL_LEFT = ':tetris-wall-left:'
const WALL_RIGHT = ':tetris-wall-right:'

const GAME_BUTTONS = {
  'btn_rotate': ':tetris-control-rotate:',
  'btn_left': ':tetris-control-left:',
  'btn_right': ':tetris-control-right:',
  'btn_down': ':tetris-control-down:',
  'btn_stop': ':tetris-control-stop:'
}

const SPLASH_TEXT = ` 
\`\`\`
 _____   _____   _____   _____    _   _____  
|_   _| | ____| |_   _| |  _  \\  | | /  ___/ 
  | |   | |__     | |   | |_| |  | | | |___  
  | |   |  __|    | |   |  _  /  | | \\___  \\ 
  | |   | |___    | |   | | \\ \\  | |  ___| | 
  |_|   |_____|   |_|   |_|  \\_\\ |_| /_____/ 
\`\`\` 

:parrotwave1: :parrotwave2: :parrotwave3: :parrotwave4: :parrotwave5: :parrotwave6: :parrotwave7:`

export type GameButtonAction = keyof typeof GAME_BUTTONS

export type TetrisBlocksGrid = (TetrominoName | 'FILL' | null)[][]

const renderBlockGrid = (blocks: TetrisBlocksGrid) => 
  blocks.reduce((str, line) => str + '\n' + WALL_LEFT + line.map(b => b ? BLOCK_EMOJI[b] : BLANK_EMOJI).join('') + WALL_RIGHT, '') + INVISIBLE_CHARACTER

// TODO render level too
export interface GameMessageData {
  startedBy: string // user ID
  mode: GameMode
  blocks?: TetrisBlocksGrid
  nextPiece?: TetrominoName
  score: number
  level: number
  gameOver: boolean
  duration: number
}

function renderGameBlocks(game: GameMessageData): { blocks: any, text: string } {
  const nextPieceText = game.nextPiece 
    ? `\n> *Next*\n> ${TETROMINO_EMOJI[game.nextPiece]}`
    : ''

  const blocks: any = [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": game.gameOver 
          ? `<@${game.startedBy}> played Tetris for ${formatMilliseconds(game.duration, true)}. Final score: *${game.score}*` 
          : `<@${game.startedBy}> is playing in ${game.mode} mode. Score: *${game.score}* | ${formatMilliseconds(game.duration)} | Lvl ${game.level} ${nextPieceText}`
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `${renderBlockGrid(game.blocks || [])}`
      }
    },
  ]

  if (!game.gameOver) {
    blocks.push({
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
    })
  } else {
    blocks.push(
      {
        "type": "divider"
      }, {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `~ ~ ~ ~ ~ ~ ~ *GAME OVER* ~ ~ ~ ~ ~ ~ ~`
        }
      }
    )
  }

  return {
    text: 'Tetris game',
    blocks
  }
}

export async function createGame (channel: string): Promise<string> {
  const msg = await bot.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    text: SPLASH_TEXT
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

export async function create2pGameOffer (channel: string, user: string): Promise<string> {
  const msg = await bot.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    text: 'Would you like to play 2-player Tetris?',
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `<@${user}> wants to play two-player Tetris.`
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Accept Challenge",
            "emoji": true
          },
          "action_id": "join-2p-game"
        }
      },
    ]
  })

  return msg.ts
}

export async function update2pGameOffer (channel: string, ts: string, user: string, opponent: string): Promise<string> {
  const msg = await bot.client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts,
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `<@${user}> is playing two-player Tetris with <@${opponent}>.`
        }
      },
      // {
      //   "type": "section",
      //   "text": {
      //     "type": "mrkdwn",
      //     "text": "To place a bet on this match, send HN to me with reason `7716`. Players: you will be refunded any bet in excess of the other player's bet."
      //   }
      // },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Start Game",
              "emoji": true
            },
            "value": "click_me_123",
            "action_id": "start-2p-game"
          }
        ]
      }
    ]
  })

  return msg.ts
}

// export const mentionBlocks = [
//   {
//     "type": "section",
//     "text": {
//       "type": "mrkdwn",
//       "text": "Hello! Do you want to play Tetris? To start a game, type `/tetris`\n\nSource: https://github.com/scitronboy/slack-tetris"
//     }
//   }
// ]