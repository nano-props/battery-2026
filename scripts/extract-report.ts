import { mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const pdf = path.join(root, '2025-2026电池年度报告V1.02.pdf')
const pagesDir = path.join(root, 'public', 'pages')
const dataDir = path.join(root, 'public', 'data')
const textFile = path.join(dataDir, 'report.txt')
const indexFile = path.join(dataDir, 'pages.json')

if (!existsSync(pdf)) throw new Error(`PDF not found: ${pdf}`)
await mkdir(pagesDir, { recursive: true })
await mkdir(dataDir, { recursive: true })

function run(command: string[]) {
  const process = Bun.spawnSync(command, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
  if (process.exitCode !== 0) throw new Error(`${command[0]} exited with ${process.exitCode}`)
}

console.log('Extracting searchable text...')
run(['pdftotext', '-layout', pdf, textFile])

const currentImages = (await readdir(pagesDir)).filter((name) => name.endsWith('.jpg'))
if (currentImages.length !== 767) {
  console.log('Rendering 767 high-fidelity pages...')
  run([
    'pdftocairo',
    '-jpeg',
    '-r',
    '144',
    '-jpegopt',
    'quality=88,progressive=y,optimize=y',
    pdf,
    path.join(pagesDir, 'page'),
  ])
}

const raw = await Bun.file(textFile).text()
const pageTexts = raw.split('\f')
if (!pageTexts.at(-1)?.trim()) pageTexts.pop()

const images = (await readdir(pagesDir))
  .filter((name) => /^page-\d+\.jpg$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))

if (pageTexts.length !== 767 || images.length !== 767) {
  throw new Error(`Completeness check failed: ${pageTexts.length} texts, ${images.length} images`)
}

const chapterStarts = [
  { page: 1, title: '封面与引言', short: '前言' },
  { page: 5, title: '工业界', short: '工业界' },
  { page: 482, title: '中国', short: '中国' },
  { page: 548, title: '学术界', short: '学术界' },
  { page: 649, title: '人才', short: '人才' },
  { page: 702, title: '政策', short: '政策' },
  { page: 751, title: '社区', short: '社区' },
  { page: 756, title: '预测', short: '预测' },
  { page: 758, title: '结束语与贡献者', short: '结束语' },
]

function cleanText(text: string) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
}

function titleFor(text: string, page: number) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const candidate = lines.find(
    (line) => !/^第?\s*\d+\s*页$/.test(line) && !/^电池年度报告\s*2025/.test(line) && !/^Revision:/.test(line),
  )
  return (candidate || `第 ${page} 页`).replace(/\s+/g, ' ').slice(0, 100)
}

const pages = pageTexts.map((text, index) => {
  const page = index + 1
  const chapter = [...chapterStarts].reverse().find((item) => item.page <= page)!
  const cleaned = cleanText(text)
  return {
    page,
    title: titleFor(text, page),
    chapter: chapter.short,
    image: `/pages/${images[index]}`,
    text: cleaned,
  }
})

await Bun.write(
  indexFile,
  JSON.stringify({
    meta: {
      title: '2025-2026 电池行业年度报告',
      pageCount: pages.length,
      source: 'Volta Foundation',
      revision: '2025013101',
    },
    chapters: chapterStarts,
    pages,
  }),
)

console.log(`Done: ${pages.length} pages, ${raw.length.toLocaleString()} text characters.`)
