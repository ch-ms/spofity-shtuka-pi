# spotify-shtuka-pi

A lightweight Pi package that adds a `spotify_player` tool for controlling Spotify via the [`spotify_player`](https://github.com/aome510/spotify-player) CLI.

The package is designed to be installed directly from GitHub and loaded by Pi without a build step.

This extension was fully videcoded.

## Requirements

- Pi coding agent
- `spotify_player` installed, configured, and authenticated on the target machine

## Installation

Install from GitHub globally:

```bash
pi install git:https://github.com/ch-ms/spotify-shtuka-pi.git
```

To install it only for a specific project, run this from the project folder with `-l`:

```bash
pi install -l git:https://github.com/ch-ms/spotify-shtuka-pi.git
```

You can also try it for one run without permanently installing it:

```bash
pi -e git:https://github.com/ch-ms/spotify-shtuka-pi.git
```

## Usage Example

After installation, ask Pi to control Spotify in natural language:

- "Play Bohemian Rhapsody"
- "Pause Spotify"
- "Set Spotify volume to 30"
- "What am I listening to?"
- "Create a playlist called Road Trip"
- "Search for Daft Punk tracks"

Pi will call the registered `spotify_player` tool with the appropriate action.

## Available Actions

- Playback: `play_track`, `play_context`, `play_pause`, `play`, `pause`, `next`, `previous`, `volume`, `seek`, `shuffle`, `repeat`
- Info: `search`, `get_playback`, `get_queue`, `get_playlists`, `get_devices`
- Social: `like`
- Devices: `connect`
- Playlists: `playlist_new`, `playlist_list`, `playlist_add`, `playlist_remove`, `playlist_delete`

