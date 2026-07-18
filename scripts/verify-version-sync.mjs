import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const packageLock = JSON.parse(readFileSync(resolve(appRoot, 'package-lock.json'), 'utf8'))
const release = JSON.parse(readFileSync(resolve(appRoot, 'release.json'), 'utf8'))

if (!/^\d+\.\d+\.\d+$/.test(release.version)) {
  throw new Error('release.json version must use semantic X.Y.Z format')
}

const localVersions = [
  packageJson.version,
  packageLock.version,
  packageLock.packages?.['']?.version,
  release.version,
  release.telemetry.version,
]

if (new Set(localVersions).size !== 1) {
  throw new Error(`Admin release metadata mismatch: ${localVersions.join(', ')}`)
}

const telemetryReleasePath = resolve(appRoot, '..', 'pz-rcon-admin-telemetry', 'release.json')
if (existsSync(telemetryReleasePath)) {
  const telemetryRelease = JSON.parse(readFileSync(telemetryReleasePath, 'utf8'))
  const pairedVersions = [release.version, release.telemetry.version, telemetryRelease.version, telemetryRelease.adminApp.version]
  if (new Set(pairedVersions).size !== 1) {
    throw new Error(`Sibling telemetry release mismatch: ${pairedVersions.join(', ')}`)
  }
  console.log(`Lockstep version verified with sibling telemetry: ${release.version}`)
} else {
  console.log(`Internal admin version metadata verified: ${release.version} (sibling telemetry checkout not present)`)
}
