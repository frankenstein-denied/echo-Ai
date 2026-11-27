import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const [dir, outDir] = process.argv.slice(2)
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  const size = f === 'user-flow.svg' ? '1500,750' : '390,844'
  const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${size}`,
    `--screenshot=${path.resolve(outDir, f.replace('.svg', '.png'))}`, pathToFileURL(path.resolve(dir, f)).href], { encoding: 'utf8' })
  console.log(f, /written/.test(r.stderr + r.stdout) ? 'ok' : 'FAIL')
}
