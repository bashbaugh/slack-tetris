if (process.env.NODE_ENV !== 'production') require('dotenv').config()
import { App } from '@slack/bolt'

const bot = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
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

async function start() {
  await bot.start(parseInt(process.env.PORT) || 5000)
  console.log('⚡️ Bot started')
}

start()