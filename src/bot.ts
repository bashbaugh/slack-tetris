import { Game, NewGameConfig } from './game'
import {
  renderLeaderboardBlocks, 
  complete2pGameOffer, 
  create2pGameOffer, 
  GameButtonAction, 
  send2pGameEndingAnnouncement, 
  update2pGameOffer, 
  sendEphemeral
} from './render'
import { Prisma, PrismaClient } from '@prisma/client'
import { App } from '@slack/bolt'
import { sendPayment } from './hn'

const prisma = new PrismaClient()

const HELP_TEXT = `Hello! Do you want to play Tetris? To start a game, type \`/tetris\`

By default, it will be in open mode, meaning anyone can press the controls and move the pieces, so you'll have to work together. Or, you can type \`/tetris 1p\` to restrict control over the game to just yourself.

TODO 2p

Source: https://github.com/scitronboy/slack-tetris`

const games: Record<string, Game> = {}

/** Timestamp, offerer ID */
const twoPlayerOffers: Record<string, string> = {}

const startGame = (cfg: NewGameConfig) => {
  const game = new Game(cfg)
  game.startGame()
    .then(ts => { games[ts] = game })
  return game
}

export function registerBotListeners(bot: App) {
  bot.command('/tetris', async ({ command, ack, say, client }) => {
    let mode = command.text
  
    if (!(mode === '1p' || mode === '2p')) mode = null
  
    if (mode === '2p') {
      const offerTs = await create2pGameOffer(command.channel_id, command.user_id)
      twoPlayerOffers[offerTs] = command.user_id
    } else startGame({
      channel: command.channel_id,
      user: command.user_id,
      mode: mode as '1p' | '2p'
    })

    ack()
  })
  
  bot.action(/btn_.+/, async ({ ack, body, client }) => {
    ack()
  
    const actionId: GameButtonAction = (body as any).actions[0].action_id
    const gameTs: string = (body as any).message.ts
  
    const game = games[gameTs]
    if (!game) {
      client.chat.update({
        channel: body.channel.id,
        ts: gameTs,
        text: `Oh no. My server may have restarted because I don't remeber this game. Start another?`
      })
      return
    }
  
    // If this isn't an open game and the user is not a player, ignore
    if (game.cfg.mode !== 'open' && game.cfg.user !== body.user.id) return
  
    switch (actionId) {
      case 'btn_left':
      case 'btn_right':
        game.movePiece(actionId.slice(4) as any) // Slice of `btn_` part
        break
      case 'btn_down':
        game.dropPiece()
        break
      case 'btn_rotate':
        game.rotatePiece()
        break
      case 'btn_stop':
        game.endGame()
        break
    }
  })

  bot.action('join-2p-game', async ({ ack, body, client }) => {
    ack()
    
    const offerTs: string = (body as any).message.ts
    const offer_user = twoPlayerOffers[offerTs]
    if (!offer_user) {
      client.chat.update({
        channel: body.channel.id,
        ts: offerTs,
        text: `Something went wrong, please create a new offer with \`/tetris 2p\``
      })
      return
    }
  
    const game = await prisma.twoPlayerGame.create({
      data: {
        offerTs,
        channel: body.channel.id,
        user: offer_user,
        opponent: body.user.id,
      }
    })
  
    update2pGameOffer(body.channel.id, offerTs, offer_user, body.user.id, game.id.toString())
  })
  
  bot.action('start-2p-game', async ({ ack, body, client }) => {
    ack()
    
    const offerTs: string = (body as any).message.ts
    
    const game = await prisma.twoPlayerGame.findFirst({
      where: {
        offerTs
      }
    })
  
    if (!game) {
      client.chat.update({
        channel: body.channel.id,
        ts: offerTs,
        text: `Something went wrong, please create a new offer with \`/tetris 2p\``
      })
      return
    }
  
    const gameCfg: Omit<NewGameConfig, 'user'> = {
      channel: body.channel.id,
      mode: '2p',
      startDelay: 5000,
      matchId: game.id.toString()
    }
  
    // Start a game for each player
    const g1 = startGame({
      ...gameCfg,
      user: game.user,
    })
    const g2 = startGame({
      ...gameCfg,
      user: game.opponent,
    })
    g1.opponent = g2
    g2.opponent = g1
  
    complete2pGameOffer(body.channel.id, offerTs, game.user, game.opponent)
  })

  bot.event('app_mention', async ({ event, client }) => {
    // say() sends a message to the channel where the event was triggered
    if (event.thread_ts) return
    client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: HELP_TEXT
    })
  })

  bot.command('/tetris-leaderboard', async ({ command, ack, say, client }) => {
    const allScores = await prisma.score.findMany({
      select: {
        user: true,
        score: true
      },
      orderBy: {
        score: 'desc'
      }
    })

    const highScores = allScores.reduce((scores: typeof allScores, score) => {
      if (scores.length === 10) return scores
      if (scores.find(s => s.user === score.user)) return scores // This user is already in high scores

      return scores.concat([score])
    }, [])

    ack({
      response_type: 'ephemeral',
      ...renderLeaderboardBlocks(highScores),
    })
  })
}

// Hooked by game class on game end
export async function onGameEnd(gameInst: Game) {
  await prisma.score.create({
    data: {
      score: gameInst.score,
      user: gameInst.cfg.user
    }
  })

  if (gameInst.cfg.mode === '2p') {
    const player = gameInst.cfg.user

    const id = parseInt(gameInst.cfg.matchId)
    const game = await prisma.twoPlayerGame.findFirst({
      where: { id }
    })
    if (!game || game.winner) return

    // First player to finish loses
    const winner = game.user === player ? game.opponent : game.user

    await prisma.twoPlayerGame.update({
      where: { id },
      data: {
        winner
      }
    })

    complete2pGameOffer(game.channel, game.offerTs, game.user, game.opponent, winner)
    send2pGameEndingAnnouncement(game.channel, game.offerTs, winner, player)
  }
}

export async function onPayment (fromId: string, amount: number, reason: string) {
  console.log('Received')
  sendEphemeral('G01LJ2RSETF', fromId, `I received ${amount} HN from you, and am sending it back :)`)
  sendPayment(fromId, amount, 'Refunddddd')
}
