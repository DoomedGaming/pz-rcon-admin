import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  throw new Error('Usage: npm run release:version -- X.Y.Z')
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const telemetryRoot = resolve(appRoot, '..', 'pz-rcon-admin-telemetry')
if (!existsSync(resolve(telemetryRoot, 'release.json'))) {
  throw new Error(`Sibling telemetry checkout is required at ${telemetryRoot}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const packagePath = resolve(appRoot, 'package.json')
const packageLockPath = resolve(appRoot, 'package-lock.json')
const appReleasePath = resolve(appRoot, 'release.json')
const telemetryReleasePath = resolve(telemetryRoot, 'release.json')

const packageJson = readJson(packagePath)
const packageLock = readJson(packageLockPath)
const appRelease = readJson(appReleasePath)
const telemetryRelease = readJson(telemetryReleasePath)

packageJson.version = version
packageLock.version = version
packageLock.packages[''].version = version
appRelease.version = version
appRelease.telemetry.version = version
telemetryRelease.version = version
telemetryRelease.adminApp.version = version

writeJson(packagePath, packageJson)
writeJson(packageLockPath, packageLock)
writeJson(appReleasePath, appRelease)
writeJson(telemetryReleasePath, telemetryRelease)

const modInfoPath = resolve(telemetryRoot, 'workshop/Contents/mods/PZRconAdminTelemetry/42/mod.info')
const workshopInfoPath = resolve(telemetryRoot, 'workshop/workshop.txt')
const modInfo = readFileSync(modInfoPath, 'utf8').replace(/^modversion=.*$/m, `modversion=${version}`)
const workshopInfo = readFileSync(workshopInfoPath, 'utf8').replace(/Release \d+\.\d+\.\d+\./, `Release ${version}.`)

writeFileSync(modInfoPath, modInfo)
writeFileSync(workshopInfoPath, workshopInfo)

console.log(`Updated both repositories and the Workshop package to ${version}.`)
