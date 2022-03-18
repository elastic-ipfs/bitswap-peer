'use strict'

const { CID } = require('multiformats/cid')

// cid1 and cid2 exists, the other two don't, cid1 is a raw block, cid2 is a dag-pb
const cid1 = CID.parse('bafkreifiqpnpysanizxoatqnnwuynply5mp52ily2bdjg4r5uoupsxkc6q')
const cid2 = CID.parse('bafybeif2am3yngj2faybsxggkh2twyxe52ijzg7orb2ofsngpebpurbkde')
const cid3 = CID.parse('bafybeiccfclkdtucu6y4yc5cpr6y3yuinr67svmii46v5cfcrkp47ihehy')
const cid4 = CID.parse('bafybeihfg3d7rdltd43u3tfvncx7n5loqofbsobojcadtmokrljfthuc7y')

// cid5, cid6 and cid7 are raw blocks of 1.5MB each so they will be splitted, cid8 is over 2 MB so it's never sent back
const cid5 = CID.parse('bafkreih3qyek7a5z7oxdumyzxzsgn42h6ixikv5tp6ae6brrnzjjsai7tq')
const cid6 = CID.parse('bafkreiazgnbcngapyt5biagk4ckxbwxxlfpaef2ml6msei465352nkyoka')
const cid7 = CID.parse('bafkreicxxkhmz75hzusvw5ouryqidnhlek2ixrlqlghjzp724p4xq3unti')
const cid8 = CID.parse('bafkreigf7cgkeki5favqpdyrxosouw6jw3bo4bsfag6qxx3v2gc5jag46m')

// cid9 is 500 byte less than the block limit
const cid9 = CID.parse('bafkreieezcbuz6d2otuscqyv6xhmhd5walvwehvat7uk66nb6k2rksc7ia')

module.exports = {
  cid1,
  cid2,
  cid3,
  cid4,
  cid5,
  cid6,
  cid7,
  cid8,
  cid9,
  cid1Content: '1234\n',
  cid2Link: 'abc'
}
