if (process.env.NODE_ENV !== 'production') require('dotenv').config()
import { App, ReactionMessageItem } from '@slack/bolt'
import { Game } from './game'

const bot = new App({
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
  await ack()

  const game = new Game({
    channel: command.channel_id,
    user: command.user_id
  })

  const gameMsgTs = await game.startGame(client)

  // Add reactions for Tetris controls
  // for (const emoji of Object.values(EmojiControl)) {
  //   client.reactions.add({
  //     channel: command.channel_id,
  //     timestamp: gameMsgTs,
  //     name: emoji
  //   })
  // }

  games[gameMsgTs] = game
})

bot.event('app_mention', async ({ event, client }) => {
  // say() sends a message to the channel where the event was triggered
  client.chat.postMessage({
    channel: event.channel,
    text: 'Hello',
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "Hello! Do you want to play Tetris?"
        }
      }
    ]
  })
})

bot.action(/btn_.+/, async ({ ack, body }) => {
  await ack()
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