# Tiny Life

A browser-first pixel life simulation where the player is free to choose how to live. The first playable vertical slice focuses on farming and community life; future professions plug into the same world/economy systems.

## v0.1 goal

- Top-down movement for desktop and mobile
- Day/time system
- Farm plots: till, plant, water, grow, harvest
- Inventory, money, seed buying and crop selling
- Simple NPC schedules and relationship hooks
- Local save/load
- Architecture ready for fishing, mining, shops, cooking and other professions

## Art direction

The project intentionally separates game logic from art assets. The environment art direction is based on **Kenney Tiny Farm (16x16, CC0)**. Third-party assets are only added when their license is explicitly documented.

- Kenney Tiny Farm: https://kenney.nl/assets/tiny-farm
- License: CC0 1.0

Do not copy Stardew Valley assets, maps, characters, music, or other copyrighted content into this repository.

## Stack

- Phaser 3.90
- TypeScript
- Vite
- GitHub Pages deployment via GitHub Actions

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Status

Foundation in progress — v0.1 farming vertical slice.
