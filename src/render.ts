import { GameMode, TetrominoName } from './game'
import { bot } from '.'
import { formatMilliseconds, pickRandom } from './util'
import { WebClient, retryPolicies } from '@slack/web-api'

const client = new WebClient(process.env.SLACK_BOT_TOKEN, {
  retryConfig: {
    ...retryPolicies.fiveRetriesInFiveMinutes 
  },
})

const noRetryClient = new WebClient(process.env.SLACK_BOT_TOKEN, {
  retryConfig: {
    retries: 0
  },
  rejectRateLimitedCalls: true
})

export const sendEphemeral = (channel: string, user: string, text: string) => client.chat.postEphemeral({
  channel,
  user,
  text
})

export const sendMessage = (channel: string, text: string, thread_ts?: string) => client.chat.postMessage({
  channel,
  thread_ts,
  text
})

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

export const GAME_BUTTONS = {
  'btn_rotate': ':tetris-control-rotate:',
  'btn_left': ':tetris-control-left:',
  'btn_right': ':tetris-control-right:',
  'btn_down': ':tetris-control-down:',
  'btn_hold': ':tetris-control-switch:',
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
  heldPiece?: TetrominoName
  score: number
  level: number
  gameOver: boolean
  duration: number
  startingIn?: number
}

function renderGameBlocks(game: GameMessageData): { blocks: any, text: string } {
  const nextPieceText = `\n> *Next*\n> ${TETROMINO_EMOJI[game.nextPiece] || INVISIBLE_CHARACTER}`
  const heldPieceText = `\n> *Hold*\n> ${TETROMINO_EMOJI[game.heldPiece] || INVISIBLE_CHARACTER}`

  const blocks: any = [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": game.gameOver 
          ? `<@${game.startedBy}> played Tetris for ${formatMilliseconds(game.duration, true)}. Final score: *${game.score}*` 
          : `<@${game.startedBy}> is playing in ${game.mode} mode. Score: *${game.score}* | ${formatMilliseconds(game.duration)} | Lvl ${game.level}`
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

    blocks.splice(1, 0, {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": nextPieceText
        },
        {
          "type": "mrkdwn",
          "text": heldPieceText
        }
      ]
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

export async function createGame (channel: string, thread_ts?: string): Promise<string> {
  const msg = await sendMessage(channel, SPLASH_TEXT, thread_ts)

  return msg.ts
}

export async function updateGame (channel: string, ts: string, game: GameMessageData) {
  // Retries completely break the game when out-of-date state arrives many seconds later.
  const clientForUpdate = game.gameOver ? client : noRetryClient
  await clientForUpdate.chat.update({
    channel,
    ts,
    ...renderGameBlocks(game)
  })
}

export async function create2pGameOffer (channel: string, user: string): Promise<string> {
  const msg = await client.chat.postMessage({
    channel,
    text: 'Want to play 2-player Tetris?',
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

export async function update2pGameOffer (
  channel: string, 
  ts: string, 
  user: string, 
  opponent: string, 
  bettingId: string, 
  betsTotal: number = 0
) {
  const msg = await client.chat.update({
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
          "text": `To place a bet on this match, send HN to me with reason \`${bettingId}-PLAYER\` (replace PLAYER with \`1\` or \`2\`). Ex: \`/send-hn 4 to @tetris for ${bettingId}-1\`. :money_with_wings: \n\nPlayers: You can only win a maximum of 2x your own bet. You will be refunded any amount bet in excess of your opponent's bet, so agree before starting on the amount to bet. \n\n*Current pool*: ${betsTotal}‡`
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

  await client.chat.update({
    token: process.env.SLACK_BOT_TOKEN,
    channel,
    ts,
    text,
    blocks: []
  })
}

export async function send2pGameEndingAnnouncement (channel: string, thread_ts: string, winner: string, loser: string) {
  const text = `<@${winner}> won!!! Better luck next time, <@${loser}>`

  const msg = await client.chat.postMessage({
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
