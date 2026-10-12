# Task World Prototype

**Paused and unfinished.** This is an **hours-long exploratory prototype**, preserved as an experiment rather than a completed product. Interaction quality did not meet the intended bar. Passing selected tests does not mean the application is finished, usable across devices, or accepted.

A small buildless Canvas/JavaScript experiment: walk around an island, enter rooms, and read fixed task-like dialogue. The UI is Simplified Chinese. **All projects, names, characters, dates, statuses, and workflows in this repository are synthetic examples.** There are no private records, live task integrations, AI agents, accounts, analytics, or backend services.

## Run locally

Requirements: Node.js 20+ for building/tests; Python 3 for the example HTTP server. No npm packages are required.

```sh
npm run build
npm test
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000>. Use an HTTP server; opening the HTML as a file will not reliably load ES modules. The server above is bound to your own machine.

Controls: Arrow keys/WASD to move, E/Enter to interact nearby, Esc to close/return, M for the map, J for the local journal. Touch controls are experimental.

## What is here

- Three levels: one island, six fictional areas, eighteen fictional stage rooms
- Keyboard movement, approximate collisions, following camera, directional hints
- Fixed read-only dialogue and a browser-local visit/read journal
- Four original AI-generated background images and code-defined original sprites
- A small attributed MIT adaptation of Pixel Agents utility algorithms

`demo.json` is the only content input. `npm run build` validates it and writes `dist/content.js`. The browser loads only the static files under `dist/`; the build reads no external source. localStorage saves visit/read identifiers, not project completion.

## Known limitations

- This was a few-hours exploration, not a polished game or production task manager. Development is paused.
- Interaction and navigation still need substantial usability work. Specific user-experience failures were not exhaustively reproduced or resolved.
- Real-browser CSS/layout, native dialog focus, physical touchscreen behavior, fullscreen, and cross-browser compatibility have **not been accepted or fully verified**.
- Node/DOM/canvas-mock tests cover selected logic only. They do not prove actual browser rendering, accessibility, or mobile usability.
- Room art is reused, collision geometry is approximate, and direction hints do not provide automatic pathfinding.
- Animation does not imply real task execution. A synthetic stage marked “done” is not a claim that this prototype is done.
- This is a frozen, six-area example with fixed scene positions, not a general-purpose editor.
- No scheduled refresh or deployment automation is included.

See [STATUS.md](STATUS.md) and [docs/VERIFICATION.md](docs/VERIFICATION.md).

## License and credits

Project code and bundled original assets are provided under [MIT](LICENSE), to the extent the contributors hold rights. The background artwork was AI-generated; no exclusivity or guaranteed copyright eligibility is asserted. Inspect [docs/ASSETS.md](docs/ASSETS.md) for provenance and hashes.

Utility code adapted from [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) retains its full MIT notice, source attribution and pinned revision under `dist/vendor/pixel-agents/`. No upstream image, furniture, layout, sprite design, or font is distributed. See [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md). This is not an official Pixel Agents release or endorsement.
