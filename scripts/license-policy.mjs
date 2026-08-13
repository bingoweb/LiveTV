const allowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Unlicense',
])

export function isAllowedLicense(license) {
  if (typeof license !== 'string' || license.trim() === '') return false

  const normalized = license.trim()
  if (normalized === 'UNLICENSED' || /\bWITH\b/.test(normalized)) return false

  const identifiers = normalized
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((token) => token !== 'AND' && token !== 'OR')

  return (
    identifiers.length > 0 &&
    identifiers.every((identifier) => allowedLicenses.has(identifier))
  )
}

export function collectManifestDependencyNames(manifests) {
  const names = new Set()

  for (const manifest of manifests) {
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      const dependencies = manifest[field] ?? {}

      for (const name of Object.keys(dependencies)) {
        if (!name.startsWith('@livetv/')) names.add(name)
      }
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right))
}
