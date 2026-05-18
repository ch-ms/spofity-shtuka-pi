# AGENTS.md

spotify-shtuka-pi — Pi extension that lets the AI control Spotify via the `spotify_player` CLI.

## How it works
- Pi's LLM picks an `action` + params, the extension maps them to `spotify_player` shell commands and runs them via `pi.exec()`.
- Output is truncated, and search results are parsed into clean track summaries (name, artists, ID).

## Files to edit
- **`extensions/spotify-shtuka.ts`** — the entire extension logic (tool registration, parameter schema, command mapping, rendering, search parsing).
- **`package.json`** — metadata, dependencies, pi entry point.
