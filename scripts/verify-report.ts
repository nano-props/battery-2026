import { readdir } from 'node:fs/promises'

const report = await Bun.file('public/data/pages.json').json()
const content = await Bun.file('public/data/content.json').json()
const sourceImages = (await readdir('public/pages')).filter((name) => name.endsWith('.jpg'))
const builtImages = (await readdir('dist/pages')).filter((name) => name.endsWith('.jpg'))
const sourceMedia = (await readdir('public/media')).filter((name) => /\.(jpg|png)$/i.test(name))
const builtMedia = (await readdir('dist/media')).filter((name) => /\.(jpg|png)$/i.test(name))
const failures: string[] = []

if (report.meta.pageCount !== 767) failures.push(`Index reports ${report.meta.pageCount} pages`)
if (report.pages.length !== 767) failures.push(`Index contains ${report.pages.length} pages`)
if (sourceImages.length !== 767) failures.push(`Source contains ${sourceImages.length} images`)
if (builtImages.length !== 767) failures.push(`Build contains ${builtImages.length} images`)
if (content.pages.length !== 767) failures.push(`Semantic index contains ${content.pages.length} pages`)
if (content.pages.reduce((sum: number, page: { blocks: unknown[] }) => sum + page.blocks.length, 0) < 14000)
  failures.push('Semantic text block count is unexpectedly low')
if (sourceMedia.length !== builtMedia.length)
  failures.push(`Media mismatch: ${sourceMedia.length} source, ${builtMedia.length} built`)
if (report.pages.some((page: { text: string }) => !page.text.trim()))
  failures.push('One or more pages have no searchable text')
if (report.pages.some((page: { page: number }, index: number) => page.page !== index + 1))
  failures.push('Page order is invalid')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(
  `Verified ${report.pages.length} ordered pages, ${content.pages.length} semantic pages, ${builtImages.length} originals and ${builtMedia.length} media assets.`,
)
