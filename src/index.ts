if (process.env.NODE_ENV !== 'production') require('dotenv').config()
import { App, ReactionMessageItem } from '@slack/bolt'
import { Game } from './game'
import { GameButtonAction, mentionBlocks } from './render'

export const bot = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

const games: Record<string, Game> = {}

// enum EmojiControl {
//   rotate = 'repeat',
//   left = 'arrow_left',
//   right = 'arrow_right',
//   down = 'arrow_down',
// }



bot.command('/tetris', async ({ command, ack, say, client }) => {
  ack()

  const game = new Game({
    channel: command.channel_id,
    user: command.user_id
  })

  const gameTs = await game.startGame()

  games[gameTs] = game
})

bot.event('app_mention', async ({ event, client }) => {
  // say() sends a message to the channel where the event was triggered
  if (event.thread_ts) return
  client.chat.postEphemeral({
    channel: event.channel,
    user: event.user,
    text: 'Hello',
    blocks: mentionBlocks
  })
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
      text: `Oh no, I don't remember this game. Start another?`,
      blocks: []
    })
    return
  }

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

// function isMsgReaction(item): item is ReactionMessageItem {
//   return !!item.channel
// }

// const onReactionAddedOrRemoved = async ({ event, client }) => {
//   if (!isMsgReaction(event.item)) return

//   const ts = event.item.ts

//   if (games[ts]) {
//     console.log(event.reaction)
//   }
// }

// bot.event('reaction_added', onReactionAddedOrRemoved)
// bot.event('reaction_removed', onReactionAddedOrRemoved)

async function start() {
  await bot.start(parseInt(process.env.PORT) || 5000)
  console.log('⚡️ Bot started')
}

start()
