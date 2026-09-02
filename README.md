# Jake Searle's Garden

A [VitePress](https://vitepress.dev/) site of notes and interactive tools, deployed to GitHub
Pages on every push to `main`.

## Getting started

Requires the Node version in `.nvmrc`.

```sh
npm ci
npm run dev
```

`npm ci` also installs the pre-commit hook via the `prepare` script — see
Privacy guard.

## Privacy guard

**This repo is public and every push to `main` publishes to the live site**, so a
push is publication. Two hooks split the work by what each can actually do:

**`pre-commit` — image metadata.** `exiftool` strips GPS, device model,
timestamps and per-photo IDs from staged images, preserving only the ICC colour
profile, then re-stages them. This has to run at commit time: it rewrites file
content, which is only possible before the commit exists. Blocks if `exiftool`
isn't installed rather than letting metadata through.

**`pre-push` — personal information.** `personal-info-scan.mjs` runs pattern
checks (GPS EXIF, phone numbers, street addresses, credential-shaped lines) and
then a `claude -p` review for what patterns miss: travel plans, health details,
home layout, other people's contact information. Runs once per push rather than
once per commit.

It scans **every blob introduced by the push**, not the net diff. A secret that
is committed and then deleted in a later commit does not show up in
`git diff base tip`, but its blob still ships to the remote and stays readable
there — which is exactly the shape of the leak this repo already had.

The Claude stage adds a few seconds per push and degrades to a warning if the
CLI is missing or errors; the pattern checks always run and always block. When
a push is blocked, the findings are in commits that already exist, so fixing
them means amending or rebasing.

```sh
npm run hooks:test          # run the scan against whatever is staged
```

False positives go in `.githooks/allowlist.txt` — only for things you are happy
to publish permanently. To bypass deliberately:

```sh
SKIP_PII_CHECK=1 git push ...      # or git push --no-verify
```

## Scripts

| Command              | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Local dev server                          |
| `npm run dev:host`   | Dev server exposed on the local network   |
| `npm run build`      | Production build into `.vitepress/dist`   |
| `npm run preview`    | Serve the production build                |
| `npm test`           | Vitest in watch mode                      |
| `npm run test:run`   | Vitest once (what CI runs)                |
| `npm run typecheck`  | `vue-tsc --noEmit`                        |
| `npm run lint`       | ESLint (`lint:fix` to autofix)            |
| `npm run format`     | Prettier (`format:check` to verify only)  |
| `npm run hooks:test` | Run the privacy scan against staged files |

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
