import t from 'tap'
import { CID } from 'multiformats/cid'
import { truncateWantlist } from '../src/limit.js'

t.test('truncateWantlist', async () => {
  // should end up with last one first. Should sort by priority then cancel: true
  const entries = [
    { priority: 1, cancel: true, cid: CID.parse('Qmd66enYAFadcPRraKbbWsXNN8oENBFo4UanvCEuVhENLU') },
    { priority: 1, cancel: false, cid: CID.parse('Qmc89yFTx1pEgWnPaUhiJGLxChCpvjkmy1HfRnSzhg61Nv') },
    { priority: 2, cancel: false, cid: CID.parse('QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn') }
  ]
  const max = 2
  const res = truncateWantlist(entries, max)
  t.same(res.length, max, 'should truncate to max length')
  t.same(res[0].cid.toString(), entries[2].cid.toString(), 'should sort by priority')
  t.same(res[1], entries[0], 'should prefer cancel: true')
})
