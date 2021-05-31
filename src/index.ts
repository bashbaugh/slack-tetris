if (process.env.NODE_ENV !== 'production') require('dotenv').config()
import { App, ExpressReceiver } from '@slack/bolt'
import { registerHNWebhookListeners } from './hn'
import { registerBotListeners } from './bot'

const receiver = new ExpressReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET })

export const bot = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
})

registerBotListeners(bot)
registerHNWebhookListeners(receiver)

async function start() {
  await bot.start(parseInt(process.env.PORT) || 5000)
  console.log('⚡️ Bot started')
}

start()
