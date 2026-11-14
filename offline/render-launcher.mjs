// Maintenance: render the stable operator entrypoint from an immutable reviewed commit.
// Usage: node offline/render-launcher.mjs <40-character-commit> <output.ps1>
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const [commit, output] = process.argv.slice(2)
if (!/^[a-f0-9]{40}$/.test(commit || '') || !output) throw new Error('Commit et fichier de sortie requis')
const response = await fetch(`https://codeload.github.com/NayerAli/v2-ocr/zip/${commit}`, { signal: AbortSignal.timeout(120000) })
if (!response.ok) throw new Error(`Source indisponible : HTTP ${response.status}`)
const hash = createHash('sha256')
for await (const bytes of response.body) hash.update(bytes)
const template = await readFile(new URL('./prepare-windows.ps1', import.meta.url), 'utf8')
const common = await readFile(new URL('./windows-common.ps1', import.meta.url), 'utf8')
const rendered = template.replace('__SOURCE_COMMIT__', commit).replace('__SOURCE_SHA256__', hash.digest('hex')).replace('# __WINDOWS_COMMON__', () => common)
await writeFile(output, rendered)
console.log(`Lanceur genere : ${output} (commit ${commit})`)
