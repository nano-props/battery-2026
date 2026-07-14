import sharp from 'sharp'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const contentPath = path.join(root, 'public', 'data', 'content.json')
const report = await Bun.file(contentPath).json()
const candidates = new Set<string>()

for (const page of report.pages) {
  for (const image of page.images) {
    if (image.width <= 320 && image.height <= 200 && image.width * image.height >= 550) candidates.add(image.src)
  }
}

const replacements = new Map<string, string>()
let cleaned = 0

for (const source of candidates) {
  const input = path.join(root, 'public', source)
  const image = sharp(input).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const dark = (pixel: number) =>
    data[pixel] < 32 && data[pixel + 1] < 32 && data[pixel + 2] < 32 && data[pixel + 3] > 0
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].filter((index) => dark(index * channels))
  if (corners.length < 2) continue

  const queue: number[] = []
  const seen = new Uint8Array(width * height)
  for (let x = 0; x < width; x++) {
    queue.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width, y * width + width - 1)
  }
  let removed = 0
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]
    if (seen[index]) continue
    seen[index] = 1
    const pixel = index * channels
    if (!dark(pixel)) continue
    data[pixel + 3] = 0
    removed++
    const x = index % width,
      y = Math.floor(index / width)
    if (x > 0) queue.push(index - 1)
    if (x < width - 1) queue.push(index + 1)
    if (y > 0) queue.push(index - width)
    if (y < height - 1) queue.push(index + width)
  }
  if (removed < width * height * 0.08) continue

  const outputSource = source.replace(/\.(jpg|jpeg)$/i, '-alpha.png')
  await sharp(data, { raw: info })
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, 'public', outputSource))
  replacements.set(source, outputSource)
  cleaned++
}

for (const page of report.pages) {
  for (const image of page.images) image.src = replacements.get(image.src) || image.src
}
await Bun.write(contentPath, JSON.stringify(report))
console.log(`Restored transparent backgrounds for ${cleaned} logo assets.`)
