# Third-party material

The only bundled third-party source is the small `dist/vendor/pixel-agents/` adaptation. Upstream: [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents), pinned at `d1e007a9fdf3003c252d2973abe1999ae59aec33`, MIT, Copyright (c) 2026 Pablo De Lucca.

The unchanged full MIT notice is in [LICENSE](../dist/vendor/pixel-agents/LICENSE). The source paths, pinned URLs, blob hashes, excerpts, line ranges and adaptations are in [provenance.json](../dist/vendor/pixel-agents/provenance.json) and [upstream-excerpts.txt](../dist/vendor/pixel-agents/upstream-excerpts.txt).

The retained utility work covers animation-loop lifecycle, BFS pathfinding, cached pixel rasterization, walking interpolation and depth sorting. The current runtime uses the loop, rasterization and sorting; its direct-input/collision engine is separate original code. Other retained helpers have self-tests but are not a claim that the full upstream application was integrated.

No upstream artwork, sprite designs, furniture/office assets, layouts, or fonts are included. No external font files, font CDNs, external image services, npm runtime dependencies, or unknown-license assets are required. Browser/system fonts supply text rendering. Background images are original AI-generated assets; see [ASSETS.md](ASSETS.md).
