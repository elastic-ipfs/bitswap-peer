import t from 'tap'
import { CID } from 'multiformats/cid'
import { denylistFilter } from '../src/deny.js'
import { createMockAgent } from './utils/mock.js'
import { setGlobalDispatcher } from 'undici'

t.test('denylistFilter', async () => {
  const denylistUrl = 'http://example.org'
  const denylist = ['QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn']

  const mock = createMockAgent()
  setGlobalDispatcher(mock)

  mock.get(denylistUrl).intercept({
    method: 'POST',
    path: '/'
  }).reply(200, JSON.stringify(denylist))

  const okList = ['QmSzQpWhK1jbLofRWBoWr1VUsKhYU9GeHWCPf31Hb653XM']

  const entries = denylist.concat(okList).map(x => ({
    cid: CID.parse(x),
    priority: 1,
    cancel: false
  }))

  const filteredList = await denylistFilter(entries, { error: console.error }, denylistUrl)
  const expected = entries.slice(1)
  t.same(filteredList, expected, 'should filter out items on denylist')
})
