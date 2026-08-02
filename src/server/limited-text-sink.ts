import { Writable } from 'node:stream'

export class LimitedTextSink extends Writable {
  private readonly chunks: Buffer[] = []
  private size = 0

  constructor(private readonly maxBytes: number, private readonly limitMessage: string) {
    super()
  }

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    this.size += bytes.length
    if (this.size > this.maxBytes) return callback(new Error(this.limitMessage))
    this.chunks.push(bytes)
    callback()
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}
