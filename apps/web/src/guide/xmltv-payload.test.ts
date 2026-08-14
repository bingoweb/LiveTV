import { gzipSync, gunzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { decodeXmltvBytes, XMLTV_MAX_BYTES } from './xmltv-payload'

function fakeGzipTransform() {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(new Uint8Array(gunzipSync(Buffer.from(chunk))))
    },
  })
}

describe('XMLTV payload decoder', () => {
  it('decodes plain UTF-8 XML unchanged', async () => {
    const xml = '<tv><channel id="a"/></tv>'
    await expect(decodeXmltvBytes(new TextEncoder().encode(xml))).resolves.toBe(
      xml,
    )
  })

  it('detects gzip by magic bytes and decompresses it', async () => {
    const xml = '<tv><programme channel="a"/></tv>'
    const compressed = new Uint8Array(gzipSync(Buffer.from(xml)))

    await expect(
      decodeXmltvBytes(compressed, {
        decompressionStreamFactory: () => fakeGzipTransform(),
      }),
    ).resolves.toBe(xml)
  })

  it('enforces the configured decompressed size limit', async () => {
    const compressed = new Uint8Array(gzipSync(Buffer.from('0123456789')))

    await expect(
      decodeXmltvBytes(compressed, {
        maxBytes: 5,
        decompressionStreamFactory: () => fakeGzipTransform(),
      }),
    ).rejects.toMatchObject({ code: 'xmltv-too-large' })
  })

  it('rejects oversized plain payloads before decoding', async () => {
    await expect(
      decodeXmltvBytes(new Uint8Array(XMLTV_MAX_BYTES + 1)),
    ).rejects.toMatchObject({ code: 'xmltv-too-large' })
  })

  it('reports a guide-only error when gzip decompression is unavailable', async () => {
    const compressed = new Uint8Array(gzipSync(Buffer.from('<tv/>')))

    await expect(
      decodeXmltvBytes(compressed, {
        decompressionStreamFactory: null,
      }),
    ).rejects.toMatchObject({ code: 'gzip-unsupported' })
  })
})
