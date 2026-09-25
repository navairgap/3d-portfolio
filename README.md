# NAVAIRGAP — 3D Interactive Portfolio

An interactive, photorealistic 3D portfolio that runs entirely in the browser. Explore a security researcher's room — click the monitor, peek at the keyboard, open the books, spin the Rubik's cube, and answer the phone.

Built with **Next.js + Three.js**.

## Highlights

- **Fully interactive 3D room** — desk setup, honeycomb wall, plants, PC tower, phone, books, and a Rubik's cube
- **Day / Night themes** — toggling adjusts the sun, LED strips, screen glow, wall text, and the overall mood of the scene
- **PBR materials** — normal, roughness, and metalness maps on keycaps, honeycomb wall, desk, floor, and tower
- **HDRI environment lighting** with soft shadows (PCFSoft) and a monitor light that spills onto the desk
- **Cinematic post-processing** — SSAO, bloom, depth of field, and film grain, with an adaptive quality guard for weaker GPUs
- **Performance-first** — Draco-compressed geometry, KTX2 GPU-native textures, LODs on the plant and PC tower
- **Subtle sound design** on interactions

## Tech Stack

| Layer         | Tech                                                       |
| ------------- | ---------------------------------------------------------- |
| Framework     | Next.js 16 (App Router) · React 19 · TypeScript            |
| 3D            | Three.js · custom postprocessing chain (SSAO, bloom, DoF, grain) |
| Styling       | Tailwind CSS 4 · shadcn/ui                                 |
| Assets        | GLB (Draco) · KTX2/Basis · HDRI (RGBE)                     |
| DB (optional) | Prisma + SQLite                                            |

## Getting Started

Requires **Node.js 20+**.

```bash
git clone https://github.com/navairgap/3d-portfolio.git
cd 3d-portfolio
npm install
npm run dev
```

Open **http://localhost:3000**. No environment variables are required for the 3D site.

`npm install` automatically runs `prisma generate` (a `postinstall` script), so the project builds out of the box on any machine. Dependencies are locked via `package-lock.json` — use npm.

> Optional: the project ships with a Prisma schema. To use it, copy `.env.example` to `.env` and run `npm run db:push`.

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start the dev server (port 3000)                     |
| `npm run build`   | Production build (runs `prisma generate` first)      |
| `npm run start`   | Serve the production build                           |
| `npm run lint`    | Run ESLint                                           |
| `npm run db:push` | Push the Prisma schema to SQLite                     |

## Project Structure

```
src/
  app/                  # Next.js App Router — single-page entry
  components/
    portfolio/          # The 3D experience
      PortfolioExperience.tsx   # scene, lighting, camera, post-processing
      gamingKeyboard.ts         # procedural RGB keycaps + PBR caps
      hexaWall.ts               # honeycomb wall with normal maps
      phoneScreen.ts            # in-world phone UI
      bookPage.ts               # book pages & covers
      rubiksCube.ts             # Rubik's cube
      floor.ts / carpet.ts      # floor + LED strips, rug
      pbr.ts                    # procedural normal/roughness map generators
      sounds.ts                 # WebAudio-synthesized interaction sounds
    ui/                   # shadcn/ui primitives
  hooks/                # shared React hooks
  lib/                  # utils + optional Prisma client
public/
  models/               # room.glb (Draco-compressed)
  textures/             # HDRI, KTX2, book covers, project art
  draco/  ktx2/         # decoders & transcoders
prisma/
  schema.prisma         # optional database schema
```

## Credits

- HDRI environment map from the [three.js examples](https://threejs.org) collection
- Geometry & texture compression: Google [Draco](https://github.com/google/draco) and Binomial [Basis Universal](https://github.com/BinomialLLC/basis_universal) — transcoders bundled
- Built with [Three.js](https://threejs.org), [Next.js](https://nextjs.org), and [shadcn/ui](https://ui.shadcn.com)

---

© NAVAIRGAP — security researcher & backend developer
