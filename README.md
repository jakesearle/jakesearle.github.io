# Jake Searle's Garden

A [VitePress](https://vitepress.dev/) site of notes and interactive tools, deployed to GitHub
Pages on every push to `main`.

## Getting started

Requires the Node version in `.nvmrc`.

```sh
npm ci
npm run dev
```

## Scripts

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Local dev server                         |
| `npm run dev:host`  | Dev server exposed on the local network  |
| `npm run build`     | Production build into `.vitepress/dist`  |
| `npm run preview`   | Serve the production build               |
| `npm test`          | Vitest in watch mode                     |
| `npm run test:run`  | Vitest once (what CI runs)               |
| `npm run typecheck` | `vue-tsc --noEmit`                       |
| `npm run lint`      | ESLint (`lint:fix` to autofix)           |
| `npm run format`    | Prettier (`format:check` to verify only) |

CI runs lint, typecheck, and tests before building — see
`.github/workflows/deploy.yml`.

## Layout

```
<section>/           Markdown pages (crochet, math, pets, rivals, random, archive)
components/<domain>/ Vue components, grouped to match their section
utils/               Framework-free logic, with colocated *.test.ts
public/              Static assets served from the site root
scripts/             Standalone helper scripts (not part of the site build)
.vitepress/          Site config and theme
```

Components are imported directly by the page that uses them rather than registered globally,
so each page only ships the widgets it renders.

## RoA2 Character Portraits

- Snag latest version from [presskit](https://www.rivals2.com/presskit)
