import { mkdir, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const pdf = process.env.REPORT_PDF || path.join(root, '2025-2026电池年度报告V1.02.pdf')
const mediaDir = path.join(root, 'public', 'media')
const xmlFile = path.join(mediaDir, 'layout.xml')
const outputFile = path.join(root, 'public', 'data', 'content.json')
const pageIndex = await Bun.file(path.join(root, 'public', 'data', 'pages.json')).json()

await mkdir(mediaDir, { recursive: true })

function run(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: mediaDir, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${command[0]} exited with ${result.exitCode}`)
}

const currentMedia = (await readdir(mediaDir)).filter((name) => /\.(jpg|png)$/i.test(name))
if (!existsSync(xmlFile) || currentMedia.length < 1000) {
  console.log('Extracting positioned text and image objects...')
  run(['pdftohtml', '-xml', '-hidden', '-nodrm', pdf, 'layout.xml'])
}

const xml = await Bun.file(xmlFile).text()

type Font = { size: number; color: string; family: string }
type Line = {
  top: number
  left: number
  width: number
  height: number
  size: number
  color: string
  text: string
  href?: string
  bold: boolean
}
type Block = Line & { bottom: number; role: 'title' | 'heading' | 'body' | 'note'; links: string[] }

const fonts = new Map<string, Font>()
for (const match of xml.matchAll(/<fontspec\s+([^>]+)\/>/g)) {
  const attrs = attributes(match[1])
  fonts.set(attrs.id, { size: number(attrs.size), color: attrs.color || '#17202a', family: attrs.family || '' })
}

function attributes(value: string) {
  return Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]))
}

function number(value?: string) {
  return Number.parseFloat(value || '0') || 0
}

function decode(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function plainText(value: string) {
  return decode(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function joinText(a: string, b: string) {
  if (!a) return b
  if (/[-–—]$/.test(a)) return a + b
  if (/[\u0000-\u00ff]$/.test(a) && /^[\u0000-\u00ff]/.test(b)) return `${a} ${b}`
  return a + b
}

function isChrome(line: Line, pageNumber: number) {
  const normalized = line.text.replace(/\s/g, '')
  return (
    line.top > 545 ||
    normalized === String(pageNumber) ||
    /^第?\d+页$/.test(normalized) ||
    /电池年度报告2025\|?/.test(normalized) ||
    /^Revision:/.test(normalized)
  )
}

function mergeLines(lines: Line[]): Block[] {
  const blocks: Block[] = []
  for (const line of [...lines].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const candidate = [...blocks].reverse().find((block) => {
      const verticalGap = line.top - block.bottom
      const aligned = Math.abs(line.left - block.left) < Math.max(22, block.width * 0.13)
      const sameScale = Math.abs(line.size - block.size) <= 2
      const horizontalOverlap =
        Math.min(block.left + block.width, line.left + line.width) - Math.max(block.left, line.left)
      return (
        verticalGap >= -4 &&
        verticalGap <= Math.max(11, line.height * 0.8) &&
        sameScale &&
        (aligned || horizontalOverlap > Math.min(block.width, line.width) * 0.55)
      )
    })
    if (candidate) {
      candidate.text = joinText(candidate.text, line.text)
      candidate.width =
        Math.max(candidate.left + candidate.width, line.left + line.width) - Math.min(candidate.left, line.left)
      candidate.left = Math.min(candidate.left, line.left)
      candidate.bottom = Math.max(candidate.bottom, line.top + line.height)
      candidate.height = candidate.bottom - candidate.top
      if (line.href && !candidate.links.includes(line.href)) candidate.links.push(line.href)
      candidate.bold ||= line.bold
    } else {
      const role =
        line.size >= 28 ? 'title' : line.size >= 17 || line.bold ? 'heading' : line.size <= 9 ? 'note' : 'body'
      blocks.push({ ...line, bottom: line.top + line.height, role, links: line.href ? [line.href] : [] })
    }
  }
  return blocks.filter((block) => block.text.length > 0)
}

function classify(blocks: Block[], images: { width: number; height: number }[]) {
  const text = blocks.map((block) => block.text).join(' ')
  const weekCount = (text.match(/Week\s*[1-5]/gi) || []).length
  const hasBackdrop = images.some((image) => image.width * image.height > 180000)
  if (hasBackdrop && blocks.some((block) => block.size >= 40)) return 'cover'
  if (weekCount >= 3) return 'timeline'
  if (/目录|CONTENTS/i.test(text) && blocks.length < 40) return 'contents'
  if (/参考文献|创作者|贡献者|编委会|翻译人员/.test(text)) return 'people'
  if (images.length >= 6) return 'gallery'
  if ((text.match(/%|GWh|GW|亿美元|百万|万吨/g) || []).length >= 5) return 'data'
  if (blocks.some((block) => block.text.length > 450)) return 'article'
  return blocks.length >= 12 ? 'grid' : 'article'
}

const pages = []
for (const pageMatch of xml.matchAll(/<page\s+([^>]+)>([\s\S]*?)<\/page>/g)) {
  const pageAttrs = attributes(pageMatch[1])
  const body = pageMatch[2]
  const pageNumber = number(pageAttrs.number)
  const lines: Line[] = []
  for (const match of body.matchAll(/<text\s+([^>]+)>([\s\S]*?)<\/text>/g)) {
    const attrs = attributes(match[1])
    const font = fonts.get(attrs.font) || { size: 12, color: '#17202a', family: '' }
    const text = plainText(match[2])
    const href = match[2].match(/href="([^"]+)"/)?.[1]
    const line: Line = {
      top: number(attrs.top),
      left: number(attrs.left),
      width: number(attrs.width),
      height: number(attrs.height),
      size: font.size,
      color: font.color,
      text,
      href: href ? decode(href) : undefined,
      bold: /<b>/.test(match[2]),
    }
    if (text && !isChrome(line, pageNumber)) lines.push(line)
  }

  const images = [...body.matchAll(/<image\s+([^>]+)\/>/g)]
    .map((match) => {
      const attrs = attributes(match[1])
      return {
        src: `/media/${attrs.src}`,
        top: number(attrs.top),
        left: number(attrs.left),
        width: number(attrs.width),
        height: number(attrs.height),
      }
    })
    .filter((image) => {
      const repeatedHeader = image.top < 75 && image.left > 850 && image.width > 100 && image.height < 40
      return !repeatedHeader && image.width * image.height >= 550
    })

  const blocks = mergeLines(lines)
  const textLines = [...lines].sort((a, b) => a.top - b.top || a.left - b.left).map(({ href: _, ...line }) => line)
  const source = pageIndex.pages[pageNumber - 1]
  pages.push({
    page: pageNumber,
    title: source.title,
    chapter: source.chapter,
    type: classify(blocks, images),
    width: number(pageAttrs.width),
    height: number(pageAttrs.height),
    textLines,
    blocks: blocks.map(({ bottom: _, href: __, ...block }) => block),
    images,
    original: source.image,
    searchText: source.text,
  })
}

if (pages.length !== 767) throw new Error(`Expected 767 pages, extracted ${pages.length}`)
await Bun.write(outputFile, JSON.stringify({ meta: pageIndex.meta, chapters: pageIndex.chapters, pages }))
await unlink(xmlFile)
console.log(
  `Generated ${pages.length} semantic pages with ${pages.reduce((sum, page) => sum + page.blocks.length, 0)} blocks and ${pages.reduce((sum, page) => sum + page.images.length, 0)} media objects.`,
)
