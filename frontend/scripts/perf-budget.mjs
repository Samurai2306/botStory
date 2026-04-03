import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const distAssets = join(process.cwd(), 'dist', 'assets')
const BUDGETS = {
  jsKb: 900,
  cssKb: 250,
}

function getFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return getFiles(fullPath)
    return [fullPath]
  })
}

function toKb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10
}

try {
  const files = getFiles(distAssets)
  const jsBytes = files.filter((f) => f.endsWith('.js')).reduce((sum, f) => sum + statSync(f).size, 0)
  const cssBytes = files.filter((f) => f.endsWith('.css')).reduce((sum, f) => sum + statSync(f).size, 0)

  const jsKb = toKb(jsBytes)
  const cssKb = toKb(cssBytes)

  console.log(`JS bundle size: ${jsKb} KB (budget: ${BUDGETS.jsKb} KB)`)
  console.log(`CSS bundle size: ${cssKb} KB (budget: ${BUDGETS.cssKb} KB)`)

  if (jsKb > BUDGETS.jsKb || cssKb > BUDGETS.cssKb) {
    console.error('Performance budget exceeded.')
    process.exit(1)
  }
  console.log('Performance budget check passed.')
} catch (error) {
  console.error('Failed to run perf budget check.', error)
  process.exit(1)
}
