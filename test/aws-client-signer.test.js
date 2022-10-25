
import t from 'tap'
import { default as signerWorker } from '../src/aws-client/signer-worker.cjs'

t.test('signer-worker - can handle both session and session-less signing', async t => {
  t.notOk(
    signerWorker({
      region: 'us-west-2',
      keyId: 'keyId',
      accessKey: 'accessKey',
      service: 's3',
      method: 'POST',
      url: 'https://bucket.s3.us-west-2.amazonaws.com',
      headers: {}
    })['x-amz-security-token']
  )

  t.ok(
    signerWorker({
      region: 'us-west-2',
      keyId: 'keyId',
      accessKey: 'accessKey',
      sessionToken: 'token',
      service: 's3',
      method: 'POST',
      url: 'https://bucket.s3.us-west-2.amazonaws.com',
      headers: {}
    })['x-amz-security-token']
  )
})
