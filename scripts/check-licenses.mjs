import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectManifestDependencyNames,
  isAllowedLicense,
} from './license-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPaths = [
  'package.json',
  'apps/web/package.json',
  'apps/api/package.json',
  'services/media-worker/package.json',
  'packages/shared/package.json',
  'packages/player-core/package.json',
]

const manifests = await Promise.all(
  manifestPaths.map(async (manifestPath) =>
    JSON.parse(await readFile(path.join(root, manifestPath), 'utf8')),
  ),
)

const dependencyNames = collectManifestDependencyNames(manifests)
const searchRoots = [
  root,
  path.join(root, 'apps/web'),
  path.join(root, 'apps/api'),
  path.join(root, 'services/media-worker'),
  path.join(root, 'packages/shared'),
  path.join(root, 'packages/player-core'),
]

const failures = []

for (const dependencyName of dependencyNames) {
  const packageJsonPath = searchRoots
    .map((searchRoot) =>
      path.join(searchRoot, 'node_modules', dependencyName, 'package.json'),
    )
    .find((candidate) => existsSync(candidate))

  if (!packageJsonPath) {
    failures.push(`${dependencyName}: package metadata not found`)
    continue
  }

  const packageMetadata = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const license = packageMetadata.license
  const displayLicense = typeof license === 'string' ? license : 'UNKNOWN'

  console.log(
    `${packageMetadata.name}@${packageMetadata.version} — ${displayLicense}`,
  )

  if (!isAllowedLicense(license)) {
    failures.push(`${dependencyName}: unapproved license ${displayLicense}`)
  }
}

if (failures.length > 0) {
  console.error('\nLicense policy failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `\nLicense policy passed for ${dependencyNames.length} dependencies.`,
  )
}
