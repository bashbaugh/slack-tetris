if (process.env.NODE_ENV !== 'production') require('dotenv').config()
import { App } from '@slack/bolt'
import { registerBotListeners } from './bot'

export const bot = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
})

registerBotListeners(bot)

async function start() {
  await bot.start(parseInt(process.env.PORT) || 5000)
  console.log('⚡️ Bot started')
}

start()
