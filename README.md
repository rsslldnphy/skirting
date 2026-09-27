# Skirting calculator

Works out how many lengths of skirting board to order, and exactly how to cut
each one.

- Enter the walls in each room, in millimetres.
- Every piece gets a cutting margin: a percentage of its length, kept between a
  minimum and a maximum (defaults: 5%, 30 mm to 100 mm).
- List the board lengths you can buy (3,050 mm and 4,200 mm by default): type a
  length and press Enter to add it, or × to remove one.
- Walls longer than your longest board are split into joined pieces, each with
  its own margin.

The app then finds the fewest boards to order (and, among equally few, the
least total length) and shows a cutting guide for every board.

Your measurements are saved in the browser. **Share** copies a link that holds
all the data (compressed into the URL hash), so it opens pre-filled for anyone
you send it to.

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
