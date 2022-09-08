'use strict'

const { createHash, createHmac } = require('crypto')

// Setup AWS credentials handling
const unsignedPayload = 'UNSIGNED-PAYLOAD'

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function hmacSha256(key, contents) {
  return createHmac('sha256', key).update(contents).digest()
}

module.exports = function ({
  region,
  keyId,
  accessKey,
  sessionToken,
  service,
  method,
  url: rawUrl,
  headers: additionalHeaders,
  payload
}) {
  const url = new URL(rawUrl)

  // Compute the full set of headers to set
  const payloadHash = payload ? sha256(payload) : unsignedPayload
  const headers = {
    'x-amz-date': new Date()
      .toISOString()
      .replace(/\.\d{0,3}/, '')
      .replace(/[:-]/g, ''),
    host: url.host,
    ...additionalHeaders
  }

  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken
  }

  if (!payload) {
    headers['x-amz-content-sha256'] = unsignedPayload
  }

  // Create the CanonicalRequest
  const sortedHeaders = Object.entries(headers).sort((a, b) => a[0].localeCompare(b[0]))

  let canonicalRequest = `${method}\n${encodeURIComponent(url.pathname).replaceAll('%2F', '/')}\n`
  let signedHeaders = ''

  for (let i = 0; i < sortedHeaders.length; i++) {
    canonicalRequest += `\n${sortedHeaders[i][0]}:${sortedHeaders[i][1]}`
    signedHeaders += ';' + sortedHeaders[i][0]
  }

  signedHeaders = signedHeaders.slice(1)
  canonicalRequest += `\n\n${signedHeaders}\n${payloadHash}`

  // Create the StringToSign
  const date = headers['x-amz-date'].slice(0, 8)
  const stringToSign = `AWS4-HMAC-SHA256
${headers['x-amz-date']}
${date}/${region}/${service}/aws4_request
${sha256(canonicalRequest)}`

  // Calculate signature
  const dateKey = hmacSha256(`AWS4${accessKey}`, date)
  const dateRegionKey = hmacSha256(dateKey, region)
  const dateRegionServiceKey = hmacSha256(dateRegionKey, service)
  const signingKey = hmacSha256(dateRegionServiceKey, 'aws4_request')
  const signature = hmacSha256(signingKey, stringToSign).toString('hex')

  // Set the headers and return
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${keyId}/${date}/${region}/${service}/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`
  return headers
}
