import axios from 'axios'

async function queryApi(query: string) {
  const { data } = await axios.post('https://hn.rishi.cx/', {
    query
  }, {
    headers: {
      secret: process.env.HN_API_TOKEN
    }
  })
}
