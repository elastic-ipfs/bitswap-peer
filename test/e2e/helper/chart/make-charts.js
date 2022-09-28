'use strict'

const fs = require('fs/promises')
const path = require('path')

// TODO doc

const TYPE = process.argv[2] ?? 'regression'
const HTML_FILE_SRC = path.resolve(__dirname, './src.html')
const HTML_FILE = path.resolve(__dirname, `../../track/trace-${TYPE}.html`)
const MB = 1024 * 1024

async function main() {
  const html = await fs.readFile(HTML_FILE_SRC, 'utf8')

  const trace = require(`../../track/${TYPE}.json`)

  const cpu = []
  const mem = []

  let tCpu = 0
  let tMem = 0
  const n = trace.track.length

  for (let i = 0; i < n; i++) {
    const row = trace.track[i]

    tCpu += row.cpu
    tMem += row.rss

    cpu.push(JSON.stringify([i, row?.cpu ?? 0]))
    mem.push(JSON.stringify([i, (row?.rss ?? 0) / MB]))
  }

  const avg = [
    'avg cpu: ' + (tCpu / n).toFixed(3) + ' %',
    'avg mem: ' + (tMem / n / MB).toFixed(3) + ' MB'
  ]

  await fs.writeFile(HTML_FILE, html
    .replace('{data}',
      'dataCpu.addRows([' +
      cpu.join(',\n') +
      '])' +

      '\n\n' +

      'dataMemory.addRows([' +
      mem.join(',\n') +
      '])')
    .replace('{avg}', avg.join('\n')),

  'utf8')
}

main()
