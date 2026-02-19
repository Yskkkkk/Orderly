# Orderly (Tauri + React + shadcn/ui + TypeScript)

Portable order tracker app scaffolded with Tauri + React + shadcn/ui + TypeScript in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Dev

```bash
pnpm install
pnpm dev
```

> Running the full Tauri app requires Rust + Windows build prerequisites.

## Frontend E2E Tests (Playwright)

```bash
pnpm test:e2e
```

First time on a new machine:

```bash
pnpm exec playwright install --with-deps
```
