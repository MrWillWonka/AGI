# The Path to AGI

Browser-based incremental (idle/clicker) game. Vanilla JS, no build step, no dependencies, no tests.

## Run

```bash
python3 server.py   # serves the repo root on http://localhost:8000 with no-cache headers
```

Any static server works (`python3 -m http.server 8000`). Opening `index.html` via `file://` also mostly works but localStorage behaves inconsistently across browsers.

## Layout

| File | Role |
|---|---|
| `index.html` | All markup, a large inline `<style>` block, the script loader, and `onclick="AGI.*"` handlers |
| `game.js` | Everything gameplay: `window.AGI` IIFE module with state, balance constants, game loop, save/load, UI updates |
| `debug-panel.js` | `window.AGIDebug`: draggable/collapsible debug panel; registers via `AGI.registerDebugPanel` or falls back to polling |
| `styles.css` | Supplemental styles (most styling lives inline in `index.html`) |
| `progressive-ui.js` | **Dead code.** `window.AGIUI` visual effects; no longer loaded since commit 949bff2. Don't edit it to fix behavior—it doesn't run |
| `server.py` | Dev-only static server |

## Architecture

- **Module pattern:** each script is an IIFE assigned to a `window.*` namespace. Only what's in the `return { ... }` at the bottom of `game.js` is public; HTML handlers call those (`AGI.generateCompute()`, `AGI.switchTab('hardware')`, etc.). Adding a button means exporting the function there.
- **State:** single `gameState` object at the top of `game.js` (`resources`, `attributes`, `upgrades`, `features`, `progress`, `settings`, `stats`). Defaults are duplicated in `initializeDefaultGameState()`—keep both in sync.
- **Balance:** all costs/rates live in `CONSTANTS` in `game.js`. Upgrade cost formula is `floor(BASE_COST * MULTIPLIER ^ level)`. Change numbers there, not inline.
- **Loop:** `requestAnimationFrame(gameLoop)` with delta time; autosave every 60 s.
- **Persistence:** `localStorage['agiGame']` as JSON. `loadGame()` uses a shallow `Object.assign(gameState, parsed)`, so a new nested key added to a default sub-object will be **missing for existing saves**. Add a migration/deep-merge when you add state fields.
- **Phases:** `progress.phase` starts at `'Narrow AI'`; tabs/features unlock via `checkMilestones()` (elements start with the `hidden` class).

## Known issues

- Scripts are loaded twice: static `<script>` tags at the bottom of `index.html` **and** `loadGameScripts()` on `DOMContentLoaded`. `AGI.init()` is likewise called from both the loader and a `window.load` listener. Its `MAX_INIT_ATTEMPTS` guard masks this. Pick one path if you touch loading.
- No tests or linter. Verify changes by running the game in a browser (Playwright/Chromium is fine) and checking the console for errors; clear `localStorage` to test a fresh start.

## Conventions

- 4-space indent, semicolons, `camelCase`, `UPPER_SNAKE` for constants.
- Player-facing feedback goes through `addLogEntry(message, type)` where `type` is `success | info | warning | error`.
- Call `updateUI()` after mutating state from an action.
- Keep it dependency-free; no bundler, framework, or CDN libraries unless explicitly requested.
