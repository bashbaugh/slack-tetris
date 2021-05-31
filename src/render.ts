import { GameMode, TetrominoName } from './game'
import { bot } from '.'
import { formatMilliseconds, pickRandom } from './util'

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
  startingIn?: number
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

  if (game.startingIn) {
    blocks.push(
      {
        "type": "divider"
      }, {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `Starting in about ${game.startingIn / 1000} seconds.`
        }
      }
    )
  }
  else if (!game.gameOver) {
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

export const sendEphemeral = (channel: string, user: string, text: string) => { 
  return bot.client.chat.postEphemeral({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    user,
    text
  })
}

export async function createGame (channel: string, thread_ts?: string): Promise<string> {
  const msg = await bot.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    thread_ts,
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

export async function update2pGameOffer (channel: string, ts: string, user: string, opponent: string, bettingId: string) {
  const msg = await bot.client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts,
    text: 'Two-player Tetris offer accepted',
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `<@${user}> (player 1) is playing against <@${opponent}> (player 2).`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `To place a bet on this match, send HN to me with reason \`${bettingId}-PLAYER\` (replace PLAYER with \`1\` or \`2\`). Ex: \`/send-hn 4 to @tetris for ${bettingId}-1\`. \n\nPlayers: you can only bet on yourself, and can win a maximum of 2x your own bet. You will be refunded any amount bet in excess of your opponent's bet, so agree beforehand on the amount to bet.`
        }
      },
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
            "action_id": "start-2p-game"
          }
        ]
      }
    ]
  })
}

const GAME_DESCRIPTION_WORDS = [
  'EPIC',
  'UNBELIEVABLE',
  'MINDBLOWING',
  'cowful',
  'cool',
  'SHOCKING',
  'UNMISSABLE'
]

const GAME_WINNER_VERB = [
  'beat',
  'destroyed',
  'absolutely shattered',
  'WHACCCKKKEED'
]

export async function complete2pGameOffer (channel: string, ts: string, user: string, opponent: string, winner?: string) {
  const winnerOpponent = winner && (user === winner ? opponent : user)
  const text = winner
    ? `<@${winner}> ${pickRandom(GAME_WINNER_VERB)} <@${winnerOpponent}> in a Tetris game!`
    : `<@${user}> is playing against <@${opponent}> in a totally ${pickRandom(GAME_DESCRIPTION_WORDS)} game!\n↓ ↓ ↓ ↓`

  await bot.client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts,
    text,
    blocks: []
  })
}

export async function send2pGameEndingAnnouncement (channel: string, thread_ts: string, winner: string, loser: string) {
  const text = `<@${winner}> won!!! Better luck next time, <@${loser}>`

  const msg = await bot.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    thread_ts,
    reply_broadcast: true,
    text
  })
}

export function renderLeaderboardBlocks(scores: {user: string, score: number}[]) {
  return {
    text: 'Tetris leaderboard',
    blocks: [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": ":medal: :tetromino-t: Top Players",
          "emoji": true
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `Player`
          },
          {
            "type": "mrkdwn",
            "text": `High score`
          }
        ]
      },
      {
        "type": "divider"
      },
      ...[].concat(...scores.map((s, i) => ([
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": `*${i}.*\t<@${s.user}>`
            },
            {
              "type": "mrkdwn",
              "text": `${s.score}`
            }
          ]
        },
        {
          "type": "divider"
        }
      ]))),
    ]
  }
}
