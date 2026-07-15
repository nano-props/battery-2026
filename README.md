# 2025-2026 Battery Industry Annual Report

A responsive online edition of the original 767-page report. Desktop browsers display the original slides for
visual fidelity, while mobile browsers can optionally reflow the extracted text, links, and images into a
screen-friendly reading layout. Both modes use TanStack Virtual and include direct page navigation, full-text
search, collapsible chapter navigation, reading progress, and light and dark themes.

## Local Development

```bash
bun install
bun run dev
```

## Production Build

```bash
bun run build
bun run verify
```

The production output is written to `dist/`. The verification command checks that all 767 ordered pages, the
structured content index, and all extracted media assets are present in the production output.

## GitHub Pages

The GitHub Pages build uses `/battery-2026/` as its Vite base path:

```bash
bun run build:gh
```

To build and publish the `docs/` directory to the `gh-pages` branch, run the deployment helper from a clean
`main` branch:

```bash
./deploy.sh
```

Configure GitHub Pages to publish from the `docs/` directory on the `gh-pages` branch. The deployment script
force-updates that generated branch and then returns to `main`.

## Regenerating Report Assets

The source PDF is intentionally excluded from the repository and production output. To regenerate the extracted
assets, place `2025-2026电池年度报告V1.02.pdf` in the project root, install Poppler, and run:

```bash
brew install poppler
bun run extract
```

The extraction pipeline generates the original page images, positioned text, hyperlinks, standalone media, and
the structured page model. It verifies the page and asset counts when extraction completes.
