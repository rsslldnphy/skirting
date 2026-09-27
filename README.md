# Skirting calculator

Works out how many lengths of skirting board to order, and exactly how to cut
each one.

- Enter the walls in each room, in millimetres.
- Every piece gets a cutting margin: a percentage of its length, kept between a
  minimum and a maximum (defaults: 5%, 30 mm to 100 mm).
- Choose which board lengths you can buy (3,050 mm and 4,200 mm are selected by
  default), or add your own.
- Walls longer than your longest board are split into joined pieces, each with
  its own margin.

The app then finds the cheapest mix of boards (least total length, or fewest
boards) and draws a cutting diagram for every board.

It's a static, frontend-only TypeScript app built with Vite. The optimiser is a
branch-and-bound cutting-stock solver (`src/solver.ts`) that runs in a Web
Worker, so no backend is needed.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # solver tests
npm run build   # static build in dist/
```

## Deployment

`.github/workflows/deploy.yml` builds, tests and deploys to GitHub Pages on
every push to `main`. Before the first deploy, enable it under
**Settings → Pages → Source: GitHub Actions**.
