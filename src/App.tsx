import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  FileImage,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover.tsx'
import { Switch } from '#/components/ui/switch.tsx'

type Block = {
  top: number
  left: number
  width: number
  height: number
  size: number
  color: string
  text: string
  bold: boolean
  role: 'title' | 'heading' | 'body' | 'note'
  links: string[]
}
type Media = { src: string; top: number; left: number; width: number; height: number }
type Page = {
  page: number
  title: string
  chapter: string
  type: string
  width: number
  height: number
  blocks: Block[]
  images: Media[]
  original: string
  searchText: string
}
type Chapter = { page: number; title: string; short: string }
type Report = {
  meta: { title: string; pageCount: number; source: string; revision: string }
  chapters: Chapter[]
  pages: Page[]
}

const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, '')
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
const cleanHeading = (page: Page) => page.title.replace(new RegExp(`^${page.chapter}\\s*`), '').trim() || page.title
const estimatePageHeight = (page: Page, mobile: boolean) => {
  if (page.type === 'cover') return mobile ? 514 : 588
  const characters = page.blocks.reduce((sum, block) => sum + block.text.length, 0)
  if (page.type === 'timeline') {
    const textHeight = mobile ? (characters / 18) * 22 : (characters / 68) * 20
    const mediaHeight = mobile ? (page.images.length / 2) * 62 : Math.max(90, (page.images.length / 4) * 34)
    return Math.max(mobile ? 1200 : 720, 190 + textHeight + mediaHeight)
  }
  const columns = mobile ? 1 : page.type === 'grid' ? 3 : page.type === 'people' ? 4 : 2
  const textHeight =
    (characters / (mobile ? 21 : 34 * columns)) * (mobile ? 24 : 25) + page.blocks.length * (mobile ? 13 : 8)
  const mediaColumns = mobile ? 2 : page.type === 'gallery' || page.type === 'people' ? 7 : 4
  const mediaHeight =
    Math.ceil(page.images.length / mediaColumns) * (page.type === 'gallery' ? 105 : mobile ? 145 : 170)
  return Math.max(mobile ? 540 : 620, 190 + textHeight + mediaHeight)
}

function TextBlock({ block }: { block: Block }) {
  const content = (
    <>
      {block.text}
      {block.links[0] && <ExternalLink aria-hidden="true" />}
    </>
  )
  const className = `text-block ${block.role} ${block.bold ? 'strong' : ''}`
  if (block.role === 'title') return <h3 className={className}>{content}</h3>
  if (block.role === 'heading') return <h4 className={className}>{content}</h4>
  if (block.links[0])
    return (
      <a className={className} href={block.links[0]} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  return <p className={className}>{content}</p>
}

function MediaItem({ media, page, prominent = false }: { media: Media; page: number; prominent?: boolean }) {
  return (
    <figure className={prominent ? 'media-item prominent' : 'media-item'}>
      <img src={assetUrl(media.src)} alt={`第 ${page} 页配图`} loading="lazy" decoding="async" />
    </figure>
  )
}

function TimelinePage({ page, blocks }: { page: Page; blocks: Block[] }) {
  const columns = Array.from({ length: 4 }, (_, index) => {
    const min = (index * page.width) / 4,
      max = ((index + 1) * page.width) / 4
    return {
      blocks: blocks.filter((block) => block.left >= min && block.left < max && !/^Week\s*\d/i.test(block.text)),
      images: page.images.filter((image) => image.left >= min && image.left < max),
    }
  })
  return (
    <div className="timeline-grid">
      {columns.map((column, index) => (
        <section className="timeline-column" key={index}>
          <div className="week-label">
            <span>{String(index + 1).padStart(2, '0')}</span>第 {index + 1} 周
          </div>
          {column.images.length > 0 && (
            <div className="logo-row">
              {column.images.map((image, i) => (
                <MediaItem key={i} media={image} page={page.page} />
              ))}
            </div>
          )}
          <div className="timeline-items">
            {column.blocks.map((block, i) => (
              <TextBlock key={i} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function CoverPage({ page, blocks }: { page: Page; blocks: Block[] }) {
  const backdrop = [...page.images].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const remaining = page.images.filter((image) => image !== backdrop).slice(0, 8)
  return (
    <div
      className="chapter-cover"
      style={
        backdrop
          ? { backgroundImage: `linear-gradient(rgba(2, 30, 63, .3), rgba(2, 30, 63, .78)), url(${backdrop.src})` }
          : undefined
      }
    >
      <div className="cover-index">{String(page.page).padStart(3, '0')}</div>
      <div className="cover-copy">
        <span>{page.chapter}</span>
        <h3>{cleanHeading(page)}</h3>
        {blocks
          .filter((block) => block.text !== page.chapter && !page.title.includes(block.text))
          .slice(0, 6)
          .map((block, i) => (
            <TextBlock key={i} block={block} />
          ))}
      </div>
      {remaining.length > 0 && (
        <div className="cover-media">
          {remaining.map((image, i) => (
            <MediaItem key={i} media={image} page={page.page} />
          ))}
        </div>
      )}
    </div>
  )
}

function StandardPage({ page, blocks }: { page: Page; blocks: Block[] }) {
  const isGallery = page.type === 'gallery' || page.type === 'people'
  const prominent = page.type === 'data' || page.type === 'article'
  const images = page.images.filter((image) => !(image.top > 500 && image.height < 45))
  return (
    <>
      <div className={`semantic-copy layout-${page.type}`}>
        {blocks.map((block, i) => (
          <TextBlock key={i} block={block} />
        ))}
      </div>
      {images.length > 0 && (
        <div className={isGallery ? 'media-grid gallery' : 'media-grid'}>
          {images.map((image, i) => (
            <MediaItem key={i} media={image} page={page.page} prominent={prominent && images.length <= 3} />
          ))}
        </div>
      )}
    </>
  )
}

function IntroductionPage({ page }: { page: Page }) {
  const dimensions = [
    ['工业界', '电池开发、制造及终端应用领域的商业里程碑'],
    ['中国', '全球最完整电池供应链的历史、先进技术与现状综述'],
    ['学术界', '基础电池科学与应用领域的学术突破'],
    ['人才', '电池领域人才的供需状况及行业洞察'],
    ['政策', '政府目标、激励政策、法规、专利趋势及其影响'],
    ['社区', '全球虚拟会议与线下交流活动'],
    ['预测', '我们认为未来 12 个月内可能出现的趋势'],
  ]
  const introduction = page.blocks.find((block) => block.text.startsWith('《电池年度报告》'))
  const disclaimer = page.blocks.find((block) => block.text.startsWith('免责声明'))
  return (
    <div className="introduction-page">
      <blockquote>
        “电池是我们时代的核心技术。”<cite>经济学人</cite>
      </blockquote>
      {introduction && <p className="introduction-copy">{introduction.text}</p>}
      <h3>本报告重点考虑以下关键维度</h3>
      <dl>
        {dimensions.map(([term, description]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
      {disclaimer && <p className="disclaimer">{disclaimer.text}</p>}
    </div>
  )
}

function SemanticPage({ page, onOriginal }: { page: Page; onOriginal: (page: Page) => void }) {
  const blocks = page.blocks.filter((block) => {
    if (page.type === 'cover') return true
    const duplicate =
      normalize(block.text) === normalize(page.title) || normalize(page.title).endsWith(normalize(block.text))
    return block.top >= 72 && !duplicate
  })
  return (
    <article id={`page-${page.page}`} data-page={page.page} className={`report-section type-${page.type}`}>
      {page.type !== 'cover' && (
        <header className="section-heading">
          <div className="section-number">{String(page.page).padStart(3, '0')}</div>
          <div>
            <span>{page.chapter}</span>
            <h2>{cleanHeading(page)}</h2>
          </div>
          <button
            className="source-button"
            onClick={() => onOriginal(page)}
            title="查看原稿"
            aria-label={`查看第 ${page.page} 页原稿`}
          >
            <FileImage />
            原稿
          </button>
        </header>
      )}
      {page.page === 2 ? (
        <IntroductionPage page={page} />
      ) : page.type === 'cover' ? (
        <CoverPage page={page} blocks={blocks} />
      ) : page.type === 'timeline' ? (
        <TimelinePage page={page} blocks={blocks} />
      ) : (
        <StandardPage page={page} blocks={blocks} />
      )}
    </article>
  )
}

function DesktopSlide({ page }: { page: Page }) {
  return (
    <article id={`page-${page.page}`} data-page={page.page} className="desktop-slide">
      <header>
        <div>
          <span>{page.chapter}</span>
          <h2>{cleanHeading(page)}</h2>
        </div>
        <b>{String(page.page).padStart(3, '0')}</b>
      </header>
      <img
        src={assetUrl(page.original)}
        alt={`原报告第 ${page.page} 页：${page.title}`}
        loading="lazy"
        decoding="async"
      />
    </article>
  )
}

export function App() {
  const [report, setReport] = useState<Report | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [progress, setProgress] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pageInput, setPageInput] = useState('')
  const [pageJumpOpen, setPageJumpOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [originalPage, setOriginalPage] = useState<Page | null>(null)
  const [isNarrow, setIsNarrow] = useState(() => matchMedia('(max-width: 900px)').matches)
  const [adaptiveMobile, setAdaptiveMobile] = useState(false)
  const structuredMode = isNarrow && adaptiveMobile
  const listRef = useRef<HTMLDivElement | null>(null)
  const currentPageRef = useRef(1)
  const modeAnchorRef = useRef<number | null>(null)
  const ignoreScrollAdjustmentsRef = useRef(false)
  const resizeTimerRef = useRef<number | undefined>(undefined)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [listWidth, setListWidth] = useState(0)
  const [forcedVirtualIndex, setForcedVirtualIndex] = useState<number | null>(null)
  const fallbackWidth = isNarrow ? innerWidth - 32 : Math.min(1240, innerWidth - (sidebarCollapsed ? 0 : 242)) - 104
  const originalPageHeight = Math.max(240, (listWidth || fallbackWidth) - 36) * 0.5625 + 92 + (isNarrow ? 14 : 28)
  const pageVirtualizer = useWindowVirtualizer({
    count: report?.pages.length ?? 0,
    estimateSize: (index) =>
      report ? (structuredMode ? estimatePageHeight(report.pages[index], true) : originalPageHeight) : 900,
    overscan: 3,
    scrollMargin,
    scrollToFn: (offset, { adjustments, behavior }) => {
      const resolvedOffset = offset + (ignoreScrollAdjustmentsRef.current ? 0 : (adjustments ?? 0))
      window.scrollTo({ top: resolvedOffset, behavior })
    },
  })

  useEffect(() => {
    fetch(assetUrl('/data/content.json'))
      .then((response) => response.json())
      .then(setReport)
  }, [])
  useEffect(() => {
    const mediaQuery = matchMedia('(max-width: 900px)')
    const update = () => setIsNarrow(mediaQuery.matches)
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const onScroll = () => {
      const height = document.documentElement.scrollHeight - innerHeight
      setProgress(height > 0 ? (scrollY / height) * 100 : 0)
    }
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!report || !listRef.current) return
    const element = listRef.current
    const update = () => {
      setScrollMargin(element.offsetTop)
      setListWidth(Math.round(element.getBoundingClientRect().width))
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => observer.disconnect()
  }, [report])
  useEffect(() => {
    window.clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = window.setTimeout(() => {
      pageVirtualizer.scrollToIndex(currentPageRef.current - 1, {
        align: structuredMode ? 'start' : 'center',
        behavior: 'auto',
      })
    }, 100)
    return () => window.clearTimeout(resizeTimerRef.current)
  }, [listWidth, structuredMode, sidebarCollapsed])
  useLayoutEffect(() => {
    pageVirtualizer.measure()
  }, [listWidth, structuredMode, sidebarCollapsed])
  useLayoutEffect(() => {
    if (forcedVirtualIndex !== null) pageVirtualizer.measure()
  }, [forcedVirtualIndex])
  useLayoutEffect(() => {
    const anchor = modeAnchorRef.current
    if (anchor === null) return
    ignoreScrollAdjustmentsRef.current = true
    pageVirtualizer.measure()
    const settle = (attempt: number) => {
      const mounted = document.getElementById(`page-${anchor}`)
      if (mounted) {
        const rect = mounted.getBoundingClientRect()
        const headerBottom = isNarrow ? 62 : 68
        const desiredTop = structuredMode
          ? headerBottom
          : headerBottom + Math.max(0, (innerHeight - headerBottom - rect.height) / 2)
        window.scrollBy({ top: rect.top - desiredTop, behavior: 'auto' })
      } else {
        pageVirtualizer.scrollToIndex(anchor - 1, { align: structuredMode ? 'start' : 'center', behavior: 'auto' })
      }
      currentPageRef.current = anchor
      setCurrentPage(anchor)
      if (attempt < 4) window.setTimeout(() => settle(attempt + 1), 80 + attempt * 30)
      else {
        modeAnchorRef.current = null
        ignoreScrollAdjustmentsRef.current = false
        setForcedVirtualIndex(null)
      }
    }
    requestAnimationFrame(() => settle(0))
  }, [structuredMode])
  const virtualItems = pageVirtualizer.getVirtualItems()
  const renderedVirtualItems = [...virtualItems]
  if (forcedVirtualIndex !== null && !renderedVirtualItems.some((item) => item.index === forcedVirtualIndex)) {
    const offset = pageVirtualizer.getOffsetForIndex(forcedVirtualIndex, 'start')?.[0]
    if (offset !== undefined && report) {
      const size = structuredMode ? estimatePageHeight(report.pages[forcedVirtualIndex], true) : originalPageHeight
      const start = offset + scrollMargin
      renderedVirtualItems.push({
        key: forcedVirtualIndex,
        index: forcedVirtualIndex,
        start,
        end: start + size,
        size,
        lane: 0,
      })
    }
  }
  useEffect(() => {
    if (modeAnchorRef.current !== null) return
    const headerBottom = isNarrow ? 62 : 68
    const mounted = [...document.querySelectorAll<HTMLElement>('[data-page]')]
      .map((element) => ({ page: Number(element.dataset.page), rect: element.getBoundingClientRect() }))
      .filter((item) => item.rect.bottom > headerBottom + 1)
    if (structuredMode) mounted.sort((a, b) => a.rect.top - b.rect.top)
    else {
      const viewportCenter = headerBottom + (innerHeight - headerBottom) / 2
      mounted.sort(
        (a, b) =>
          Math.abs((a.rect.top + a.rect.bottom) / 2 - viewportCenter) -
          Math.abs((b.rect.top + b.rect.bottom) / 2 - viewportCenter),
      )
    }
    if (mounted[0]) {
      currentPageRef.current = mounted[0].page
      setCurrentPage(mounted[0].page)
    }
  }, [progress, virtualItems, isNarrow, structuredMode])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('report-theme', theme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#171918' : '#f3f2ee')
  }, [theme])
  useEffect(() => {
    document.body.classList.toggle('modal-open', Boolean(originalPage || searchOpen))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOriginalPage(null)
        setSearchOpen(false)
      }
      if (!originalPage || !report) return
      if (event.key === 'ArrowRight')
        setOriginalPage(report.pages[Math.min(report.pages.length - 1, originalPage.page)])
      if (event.key === 'ArrowLeft') setOriginalPage(report.pages[Math.max(0, originalPage.page - 2)])
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [originalPage, report, searchOpen])

  const results = useMemo(() => {
    const term = normalize(query)
    if (!report || !term) return []
    return report.pages.filter((page) => normalize(`${page.title}${page.searchText}`).includes(term)).slice(0, 100)
  }, [query, report])
  const activeChapter = report ? [...report.chapters].reverse().find((chapter) => chapter.page <= currentPage) : null
  const changeAdaptiveMobile = (checked: boolean) => {
    modeAnchorRef.current = currentPageRef.current
    setForcedVirtualIndex(currentPageRef.current - 1)
    setAdaptiveMobile(checked)
  }
  const goTo = (page: number) => {
    setSidebarOpen(false)
    setSearchOpen(false)
    currentPageRef.current = page
    setCurrentPage(page)

    if (!structuredMode) {
      const pageStart = pageVirtualizer.getOffsetForIndex(page - 1, 'start')?.[0]
      if (pageStart !== undefined) {
        const headerBottom = isNarrow ? 62 : 68
        const slideHeight = originalPageHeight - (isNarrow ? 14 : 28)
        const desiredTop = headerBottom + Math.max(0, (innerHeight - headerBottom - slideHeight) / 2)
        window.scrollTo({ top: Math.max(0, pageStart - desiredTop), behavior: 'auto' })
      }
      return
    }

    setForcedVirtualIndex(page - 1)
    const settle = (attempt: number) => {
      if (report) {
        if (attempt === 0) ignoreScrollAdjustmentsRef.current = true
        const mounted = document.getElementById(`page-${page}`)
        if (mounted) {
          const top = mounted.getBoundingClientRect().top + scrollY - (isNarrow ? 62 : 68)
          window.scrollTo({ top, behavior: 'auto' })
        } else {
          if (attempt === 0) pageVirtualizer.measure()
          pageVirtualizer.scrollToIndex(page - 1, { align: 'start', behavior: 'auto' })
        }
      }
      if (attempt < 5) window.setTimeout(() => settle(attempt + 1), 140 + attempt * 45)
      else {
        ignoreScrollAdjustmentsRef.current = false
        setForcedVirtualIndex(null)
      }
    }
    requestAnimationFrame(() => settle(0))
  }
  const submitPage = (event: React.FormEvent) => {
    event.preventDefault()
    const requested = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(requested)) return
    goTo(Math.min(report?.meta.pageCount ?? 767, Math.max(1, requested)))
    setPageInput('')
    setPageJumpOpen(false)
  }
  if (!report)
    return (
      <main className="loading">
        <span className="loading-mark">VF</span>
        <p>正在构建结构化报告...</p>
      </main>
    )

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="reading-progress" style={{ width: `${progress}%` }} />
      <header className="topbar">
        <button
          className="icon-button mobile-only"
          onClick={() => setSidebarOpen(true)}
          title="打开目录"
          aria-label="打开目录"
        >
          <Menu />
        </button>
        <button
          className="icon-button desktop-only"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? '展开目录' : '收起目录'}
          aria-label={sidebarCollapsed ? '展开目录' : '收起目录'}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        <a className="brand" href="#page-1">
          <span className="brand-mark">VF</span>
          <span className="brand-copy">
            <strong>电池年度报告</strong>
            <small>2025—2026</small>
          </span>
        </a>
        <div className="chapter-status">
          <span>{activeChapter?.title}</span>
        </div>
        <Popover open={pageJumpOpen} onOpenChange={setPageJumpOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="page-indicator" aria-label="跳转到指定页">
              <b>{currentPage}</b>
              <small>/ {report.meta.pageCount}</small>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="page-jump-content">
            <form onSubmit={submitPage}>
              <div>
                <strong>跳转到指定页</strong>
                <small>共 {report.meta.pageCount} 页</small>
              </div>
              <div className="page-jump-controls">
                <Input
                  autoFocus
                  type="number"
                  min="1"
                  max={report.meta.pageCount}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  placeholder={`1–${report.meta.pageCount}`}
                  aria-label="输入页码"
                />
                <Button type="submit" size="icon" aria-label="确认跳转">
                  <CornerDownLeft />
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setSearchOpen(true)} title="全文搜索" aria-label="全文搜索">
            <Search />
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title="切换主题"
            aria-label="切换主题"
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
        </div>
        <div className="mobile-reflow-toggle mobile-only">
          <span>重排</span>
          <Switch checked={adaptiveMobile} onCheckedChange={changeAdaptiveMobile} aria-label="移动端重排" />
        </div>
      </header>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-heading">
          <span>章节索引</span>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="关闭目录">
            <X />
          </button>
        </div>
        <nav>
          {report.chapters.map((chapter, index) => {
            const end = report.chapters[index + 1]?.page - 1 || report.meta.pageCount
            const active = chapter.page <= currentPage && currentPage <= end
            return (
              <button className={active ? 'active' : ''} key={chapter.page} onClick={() => goTo(chapter.page)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <b>{chapter.title}</b>
                <small>
                  {chapter.page}—{end}
                </small>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-meta">
          <BookOpen />
          <span>
            2025—2026
            <br />
            <small>电池行业年度报告 · 中文版</small>
          </span>
        </div>
      </aside>
      {sidebarOpen && <button className="drawer-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭目录" />}
      <main className="report-flow">
        <div ref={listRef} className="virtual-report" style={{ height: `${pageVirtualizer.getTotalSize()}px` }}>
          {renderedVirtualItems.map((virtualPage) => {
            const page = report.pages[virtualPage.index]
            return (
              <div
                className="virtual-page"
                key={page.page}
                data-index={virtualPage.index}
                ref={structuredMode ? pageVirtualizer.measureElement : undefined}
                style={{ transform: `translateY(${virtualPage.start - scrollMargin}px)` }}
              >
                {structuredMode ? (
                  <SemanticPage page={page} onOriginal={setOriginalPage} />
                ) : (
                  <DesktopSlide page={page} />
                )}
              </div>
            )
          })}
        </div>
        <footer>
          <span className="brand-mark">VF</span>
          <p>
            2025—2026 电池行业年度报告
            <br />
            <small>Volta Foundation</small>
          </p>
        </footer>
      </main>
      {progress > 3 && (
        <button
          className="back-top icon-button"
          onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}
          title="返回顶部"
          aria-label="返回顶部"
        >
          <ArrowUp />
        </button>
      )}
      {searchOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true">
          <button className="modal-scrim" onClick={() => setSearchOpen(false)} aria-label="关闭搜索" />
          <section className="search-panel">
            <div className="search-input">
              <Search />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技术、公司、数据或政策…"
              />
              <button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="关闭搜索">
                <X />
              </button>
            </div>
            <div className="search-summary">
              {query
                ? `找到 ${results.length}${results.length === 100 ? '+' : ''} 个相关页面`
                : '检索整份报告的结构化文字'}
            </div>
            <div className="search-results">
              {results.map((page) => (
                <button key={page.page} onClick={() => goTo(page.page)}>
                  <b>{cleanHeading(page)}</b>
                  <span>
                    {page.chapter} · 第 {page.page} 页 · {page.type}
                  </span>
                  <p>{page.searchText.slice(0, 150)}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {originalPage && (
        <div className="original-view" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>原稿核对</span>
              <b>{cleanHeading(originalPage)}</b>
            </div>
            <button className="icon-button" onClick={() => setOriginalPage(null)} aria-label="关闭原稿">
              <X />
            </button>
          </header>
          <div className="original-stage">
            <img src={assetUrl(originalPage.original)} alt={`原报告第 ${originalPage.page} 页`} />
          </div>
          <button
            className="original-nav prev"
            disabled={originalPage.page === 1}
            onClick={() => setOriginalPage(report.pages[originalPage.page - 2])}
          >
            <ChevronLeft />
          </button>
          <button
            className="original-nav next"
            disabled={originalPage.page === report.meta.pageCount}
            onClick={() => setOriginalPage(report.pages[originalPage.page])}
          >
            <ChevronRight />
          </button>
          <div className="original-count">
            {originalPage.page} / {report.meta.pageCount}
          </div>
        </div>
      )}
    </div>
  )
}
