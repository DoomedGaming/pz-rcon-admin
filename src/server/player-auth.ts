import { createHash } from 'node:crypto'
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Client, type AccessOptions } from 'basic-ftp'
import { compare } from 'bcryptjs'

const MAX_DATABASE_BYTES = 16 * 1024 * 1024
const PZ_PASSWORD_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const DUMMY_PASSWORD_HASH = '$2a$12$O/BFHoDFPrfFaNPAACmWpu1f4Rokb75qcAyMLdEBm/Ygcx802/k92'

export interface PlayerAuthFtpConfig extends AccessOptions {
  enabled: boolean
  remotePath: string
  world: string
}

interface PlayerCredential {
  username: string
  passwordHash: string
  authType: number
}

interface FtpClient {
  ftp: { verbose: boolean }
  access(options: AccessOptions): Promise<unknown>
  size(path: string): Promise<number>
  downloadTo(localPath: string, remotePath: string): Promise<unknown>
  close(): void
}

type FtpClientFactory = () => FtpClient

export function projectZomboidPasswordDigest(password: string): string {
  // Build 42 applies ServerWorldDatabase.encrypt (MD5) before PZcrypt's bcrypt check.
  return createHash('md5').update(password.trim(), 'utf8').digest('hex')
}

export async function projectZomboidPasswordMatches(password: string, storedHash: string): Promise<boolean> {
  const hash = PZ_PASSWORD_HASH.test(storedHash) ? storedHash : DUMMY_PASSWORD_HASH
  return compare(projectZomboidPasswordDigest(password), hash)
}

export class PzPlayerCredentialVerifier {
  constructor(
    private readonly config: PlayerAuthFtpConfig,
    private readonly createClient: FtpClientFactory = () => new Client(),
  ) {}

  get configured(): boolean {
    return Boolean(
      this.config.enabled
      && this.config.host
      && this.config.user
      && this.config.password
      && this.config.remotePath
      && this.config.world,
    )
  }

  async verify(username: string, password: string): Promise<string | undefined> {
    const requestedUsername = username.trim()
    if (!this.configured || !requestedUsername || Buffer.byteLength(requestedUsername, 'utf8') > 64) return undefined
    if (!password.trim() || Buffer.byteLength(password, 'utf8') > 256) return undefined

    const credential = await this.fetchCredential(requestedUsername)
    const matches = await projectZomboidPasswordMatches(password, credential?.passwordHash ?? DUMMY_PASSWORD_HASH)
    if (!credential || credential.authType !== 1 || !matches) return undefined
    return credential.username
  }

  private async fetchCredential(username: string): Promise<PlayerCredential | undefined> {
    const directory = await mkdtemp(join(tmpdir(), 'pz-player-auth-'))
    const databasePath = join(directory, 'accounts.db')
    const client = this.createClient()
    let database: DatabaseSync | undefined

    try {
      client.ftp.verbose = false
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure,
      })
      const remoteSize = await client.size(this.config.remotePath)
      if (!Number.isFinite(remoteSize) || remoteSize <= 0 || remoteSize > MAX_DATABASE_BYTES) {
        throw new Error('Player account database size is invalid')
      }

      await client.downloadTo(databasePath, this.config.remotePath)
      await chmod(databasePath, 0o600)
      const localSize = (await stat(databasePath)).size
      if (localSize !== remoteSize) throw new Error('Player account database download was incomplete')

      database = new DatabaseSync(databasePath, { readOnly: true })
      const rows = database.prepare(`
        SELECT username, password, authType
        FROM whitelist
        WHERE username = ? COLLATE BINARY AND world = ?
        LIMIT 1
      `).all(username, this.config.world) as Array<Record<string, unknown>>

      if (rows.length !== 1) return undefined
      const [row] = rows
      const canonicalUsername = typeof row.username === 'string' ? row.username.trim() : ''
      const passwordHash = typeof row.password === 'string' ? row.password : ''
      const authType = Number(row.authType)
      if (!canonicalUsername || Buffer.byteLength(canonicalUsername, 'utf8') > 64 || !PZ_PASSWORD_HASH.test(passwordHash)) return undefined
      return { username: canonicalUsername, passwordHash, authType }
    } finally {
      database?.close()
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
}
