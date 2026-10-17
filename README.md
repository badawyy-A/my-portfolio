# badawi.dev

Personal portfolio of Badawi, AI and full-stack engineer. Astro (static) with React Three Fiber islands for the 3D, deployed to GitHub Pages at https://badawi.dev.

## Run it

Needs Node 22.22 or newer (`.nvmrc` pins 24).

```bash
nvm use
npm install
npm run dev       # http://localhost:4321
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Edit content

- Projects: `src/content/projects/*.md` (frontmatter + Problem / Features / How it works).
- Everything else on the home page: `src/content/site.yaml`.
- Or in the browser: https://badawi.dev/admin (Pages CMS, sign in with GitHub).

The schema in `src/content.config.ts` fails the build with a clear error if a field is missing. Values written as `[TODO: ...]` show up on the page as visible placeholders.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml` and publishes to GitHub Pages.

## Avatar

`public/models/avatar.glb` is generated from `model.fbx` (not committed). The steps are at the top of `scripts/avatar/prepare.mjs`.
