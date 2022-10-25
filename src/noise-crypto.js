
import { default as sodium } from 'sodium-native'
import { concat as uint8ArrayConcat } from 'uint8arrays/concat'

const hkdfBlockLen = 64
const hkdfHashLen = 32
const hkdfStep1 = new Uint8Array([0x01])
const hkdfStep2 = new Uint8Array([0x02])
const hkdfStep3 = new Uint8Array([0x03])
const hmacBuffer = sodium.sodium_malloc(hkdfBlockLen * 3)
const hmacKey = hmacBuffer.subarray(hkdfBlockLen * 0, hkdfBlockLen)
const hmacOuterKeyPad = hmacBuffer.subarray(hkdfBlockLen, hkdfBlockLen * 2)
const hmacInnerKeyPad = hmacBuffer.subarray(hkdfBlockLen * 2, hkdfBlockLen * 3)

function hmac (out, data, key) {
  if (key.byteLength > hkdfBlockLen) {
    sodium.crypto_hash_sha256(hmacKey.subarray(0, hkdfHashLen), key)
    sodium.sodium_memzero(hmacKey.subarray(hkdfHashLen))
  } else {
    hmacKey.set(key)
    sodium.sodium_memzero(hmacKey.subarray(key.byteLength))
  }

  for (let i = 0; i < hmacKey.byteLength; i++) {
    hmacOuterKeyPad[i] = 0x5c ^ hmacKey[i]
    hmacInnerKeyPad[i] = 0x36 ^ hmacKey[i]
  }

  sodium.crypto_hash_sha256(out, uint8ArrayConcat([hmacInnerKeyPad, data]))
  sodium.sodium_memzero(hmacInnerKeyPad)
  sodium.crypto_hash_sha256(out, uint8ArrayConcat([hmacOuterKeyPad, out]))
  sodium.sodium_memzero(hmacOuterKeyPad)
}

function hashSHA256 (data) {
  const out = sodium.sodium_malloc(32)
  sodium.crypto_hash_sha256(out, data)

  return out
}

function getHKDF (ck, ikm) {
  // Extract
  const prk = sodium.sodium_malloc(32)
  hmac(prk, ikm, ck)

  // Derive
  const out = sodium.sodium_malloc(hkdfHashLen * 3)
  const out1 = out.subarray(0, hkdfHashLen)
  const out2 = out.subarray(hkdfHashLen, hkdfHashLen * 2)
  const out3 = out.subarray(hkdfHashLen * 2, hkdfHashLen * 3)
  hmac(out1, hkdfStep1, prk)
  hmac(out2, uint8ArrayConcat([out1, hkdfStep2]), prk)
  hmac(out3, uint8ArrayConcat([out2, hkdfStep3]), prk)

  return [
    out.slice(0, hkdfHashLen),
    out.slice(hkdfHashLen, hkdfHashLen * 2),
    out.slice(hkdfHashLen * 2, hkdfHashLen * 3)
  ]
}

function generateX25519KeyPair () {
  const publicKey = sodium.sodium_malloc(sodium.crypto_box_PUBLICKEYBYTES)
  const privateKey = sodium.sodium_malloc(sodium.crypto_box_SECRETKEYBYTES)

  sodium.crypto_box_keypair(publicKey, privateKey)

  return { publicKey, privateKey }
}

function generateX25519KeyPairFromSeed (seed) {
  const publicKey = sodium.sodium_malloc(sodium.crypto_box_PUBLICKEYBYTES)
  const privateKey = sodium.sodium_malloc(sodium.crypto_box_SECRETKEYBYTES)

  sodium.crypto_box_seed_keypair(publicKey, privateKey, seed)

  return { publicKey, privateKey }
}

function generateX25519SharedKey (privateKey, publicKey) {
  const shared = sodium.sodium_malloc(sodium.crypto_scalarmult_BYTES)
  sodium.crypto_scalarmult(shared, privateKey, publicKey)

  return shared
}

function chaCha20Poly1305Encrypt (plaintext, nonce, ad, k) {
  // eslint-disable-next-line camelcase
  const out = sodium.sodium_malloc(plaintext.length + sodium.crypto_aead_chacha20poly1305_ietf_ABYTES)

  sodium.crypto_aead_chacha20poly1305_ietf_encrypt(out, plaintext, ad, null, nonce, k)

  return out
}

function chaCha20Poly1305Decrypt (ciphertext, nonce, ad, k) {
  // eslint-disable-next-line camelcase
  const out = sodium.sodium_malloc(ciphertext.length - sodium.crypto_aead_chacha20poly1305_ietf_ABYTES)

  try {
    sodium.crypto_aead_chacha20poly1305_ietf_decrypt(out, null, ciphertext, ad, nonce, k)
  } catch (error) {
    if (error.message === 'could not verify data') {
      return null
    }

    throw error
  }

  return out
}

// must follow interface https://github.com/ChainSafe/js-libp2p-noise/blob/master/src/crypto.ts
const noiseCrypto = {
  hashSHA256,
  getHKDF,
  generateX25519KeyPair,
  generateX25519KeyPairFromSeed,
  generateX25519SharedKey,
  chaCha20Poly1305Encrypt,
  chaCha20Poly1305Decrypt
}

export { noiseCrypto }
