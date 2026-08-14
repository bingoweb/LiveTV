export const XMLTV_MAX_BYTES = 50 * 1024 * 1024

export type XmltvPayloadErrorCode = 'xmltv-too-large' | 'gzip-unsupported'

export class XmltvPayloadError extends Error {
  constructor(
    public readonly code: XmltvPayloadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'XmltvPayloadError'
  }
}

export type XmltvDecompressionStreamFactory =
  ((format: 'gzip') => TransformStream<Uint8Array, Uint8Array>) | null

function isGzip(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

function defaultDecompressionStreamFactory(): XmltvDecompressionStreamFactory {
  if (typeof DecompressionStream !== 'function') return null
  return (format) =>
    new DecompressionStream(format) as unknown as TransformStream<
      Uint8Array,
      Uint8Array
    >
}

async function collectReadableBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel('xmltv-too-large').catch(() => undefined)
        throw new XmltvPayloadError(
          'xmltv-too-large',
          'XMLTV verisi izin verilen boyutu aşıyor.',
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function readResponseBytes(
  response: Response,
  maxBytes = XMLTV_MAX_BYTES,
) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      throw new XmltvPayloadError(
        'xmltv-too-large',
        'XMLTV verisi izin verilen boyutu aşıyor.',
      )
    }
    return bytes
  }
  return await collectReadableBytes(response.body, maxBytes)
}

export async function decodeXmltvBytes(
  bytes: Uint8Array,
  options: {
    maxBytes?: number
    decompressionStreamFactory?: XmltvDecompressionStreamFactory
  } = {},
) {
  const maxBytes = options.maxBytes ?? XMLTV_MAX_BYTES
  let decodedBytes = bytes

  if (isGzip(bytes)) {
    const factory =
      options.decompressionStreamFactory === undefined
        ? defaultDecompressionStreamFactory()
        : options.decompressionStreamFactory
    if (!factory) {
      throw new XmltvPayloadError(
        'gzip-unsupported',
        'Bu tarayıcı gzip XMLTV verisini açamıyor.',
      )
    }

    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    decodedBytes = await collectReadableBytes(
      input.pipeThrough(factory('gzip')),
      maxBytes,
    )
  } else if (bytes.byteLength > maxBytes) {
    throw new XmltvPayloadError(
      'xmltv-too-large',
      'XMLTV verisi izin verilen boyutu aşıyor.',
    )
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(decodedBytes)
}
