/**
 * Spotify Tool - Custom pi tool wrapping spotify_player CLI
 *
 * Pi package extension. Install this repository with `pi install git:https://github.com/ch-ms/spotify-shtuka-pi.git`.
 *
 * It provides a `spotify_player` tool the LLM can call to control Spotify
 * playback, search, get data, and manage the queue via the
 * spotify_player command-line interface.
 */

import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	type ExtensionAPI,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/* ------------------------------------------------------------------ */
// Parameter schema

const SpotifyParams = Type.Object({
	action: StringEnum([
		"search",
		"play_track",
		"play_context",
		"play_pause",
		"pause",
		"play",
		"next",
		"previous",
		"volume",
		"seek",
		"shuffle",
		"repeat",
		"get_playback",
		"get_queue",
		"get_playlists",
		"get_devices",
		"like",
		"connect",
		"playlist_new",
		"playlist_list",
		"playlist_add",
		"playlist_remove",
		"playlist_delete",
	] as const),
	query: Type.Optional(Type.String({ description: "Search query, track name, or context name (depends on action)" })),
	id: Type.Optional(Type.String({ description: "Spotify ID/URI (alternative to name/query)" })),
	context_type: Type.Optional(
		StringEnum(["playlist", "album", "artist"] as const, {
			description: "For play_context: playlist, album, or artist",
		})
	),
	value: Type.Optional(Type.Number({ description: "Numeric value: volume % (0-100) or seek offset in ms" })),
	shuffle: Type.Optional(Type.Boolean({ description: "For play_context: shuffle the launched playback" })),
	public: Type.Optional(Type.Boolean({ description: "For playlist_new: make playlist public" })),
	description: Type.Optional(Type.String({ description: "For playlist_new: optional description" })),
	playlist_id: Type.Optional(Type.String({ description: "For playlist_add/playlist_remove/playlist_delete: target playlist ID" })),
	track_id: Type.Optional(Type.String({ description: "For playlist_add/playlist_remove: track ID to add or remove" })),
});

type SpotifyAction =
	| "search"
	| "play_track"
	| "play_context"
	| "play_pause"
	| "pause"
	| "play"
	| "next"
	| "previous"
	| "volume"
	| "seek"
	| "shuffle"
	| "repeat"
	| "get_playback"
	| "get_queue"
	| "get_playlists"
	| "get_devices"
	| "like"
	| "connect"
	| "playlist_new"
	| "playlist_list"
	| "playlist_add"
	| "playlist_remove"
	| "playlist_delete";

interface SpotifyDetails {
	action: SpotifyAction;
	command: string[];
	truncation?: TruncationResult;
}

/* ------------------------------------------------------------------ */
// Helper: run spotify_player command and handle output

async function runSpotify(
	pi: ExtensionAPI,
	args: string[],
	signal: AbortSignal | undefined,
	ctx: { cwd: string }
): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
	const result = await pi.exec("spotify_player", args, { signal, timeout: 60000, cwd: ctx.cwd });
	return result;
}

function truncateOutput(output: string): { text: string; truncation?: TruncationResult } {
	const truncation = truncateHead(output, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	let text = truncation.content;

	if (truncation.truncated) {
		text += `

[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
		text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`;
	}

	return { text, truncation: truncation.truncated ? truncation : undefined };
}

/* ------------------------------------------------------------------ */
// Extension factory

export default function(pi: ExtensionAPI) {
	pi.registerTool({
		name: "spotify_player",
		label: "Spotify Player",
		description:
			"Control Spotify via the spotify_player CLI. " +
			"Actions: search, play_track, play_context (playlist/album/artist), playback controls (play_pause/pause/play/next/previous/volume/seek/shuffle/repeat), " +
			"get info (playback/queue/playlists/devices), like current track, connect device, " +
			"and manage playlists (playlist_new/playlist_list/playlist_add/playlist_remove/playlist_delete). " +
			`Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}. ` +
			"Use play_track or play_context with either a name/query or an id.",
		promptSnippet: "Control Spotify playback, search, and get playback data via spotify_player CLI",
		promptGuidelines: [
			"Use spotify_player when the user wants to play, pause, skip, search, get info about Spotify playback, or manage playlists.",
			"For play_track, provide either query (track name) or id, not both unless necessary.",
			"For play_context, provide context_type (playlist, album, artist) plus query or id.",
			"For volume, provide value as a percentage between 0 and 100.",
			"For seek, provide value as offset in milliseconds (positive or negative).",
			"For playlist_new, provide query as the playlist name and optionally description and public.",
			"For playlist_add/playlist_remove/playlist_delete, playlist_id and track_id accept both bare IDs and full Spotify URIs — the tool strips prefixes automatically.",
			"For search, the result is parsed into a clean track summary with IDs, making it easy to pick tracks for playlist_add.",
			"For playlist_list, no additional arguments are needed.",
		],
		parameters: SpotifyParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { action, query, id, context_type, value, shuffle, public: isPublic, description, playlist_id, track_id } = params;

			// Normalize IDs: strip spotify:playlist: and spotify:track: prefixes automatically
			const cleanPlaylistId = playlist_id?.replace(/^spotify:playlist:/, "");
			const cleanTrackId = track_id?.replace(/^spotify:track:/, "");
			const cleanId = id?.replace(/^spotify:(playlist|track|album|artist):/, "");

			const args: string[] = [];

			switch (action) {
				case "search": {
					if (!query) throw new Error("search requires a query");
					args.push("search", query);
					break;
				}
				case "play_track": {
					args.push("playback", "start", "track");
					if (id) {
						args.push("--id", id);
					} else if (query) {
						args.push("--name", query);
					} else {
						throw new Error("play_track requires either id or query");
					}
					break;
				}
				case "play_context": {
					if (!context_type) throw new Error("play_context requires context_type (playlist, album, artist)");
					args.push("playback", "start", "context");
					if (shuffle) args.push("--shuffle");
					if (cleanId) {
						args.push("--id", cleanId);
					} else if (query) {
						args.push("--name", query);
					} else {
						throw new Error("play_context requires either id or query");
					}
					args.push(context_type);
					break;
				}
				case "play_pause": {
					args.push("playback", "play-pause");
					break;
				}
				case "pause": {
					args.push("playback", "pause");
					break;
				}
				case "play": {
					args.push("playback", "play");
					break;
				}
				case "next": {
					args.push("playback", "next");
					break;
				}
				case "previous": {
					args.push("playback", "previous");
					break;
				}
				case "volume": {
					if (value === undefined) throw new Error("volume requires a value (0-100)");
					args.push("playback", "volume", String(value));
					break;
				}
				case "seek": {
					if (value === undefined) throw new Error("seek requires a value in milliseconds");
					args.push("playback", "seek", String(value));
					break;
				}
				case "shuffle": {
					args.push("playback", "shuffle");
					break;
				}
				case "repeat": {
					args.push("playback", "repeat");
					break;
				}
				case "get_playback": {
					args.push("get", "key", "playback");
					break;
				}
				case "get_queue": {
					args.push("get", "key", "queue");
					break;
				}
				case "get_playlists": {
					args.push("get", "key", "user-playlists");
					break;
				}
				case "get_devices": {
					args.push("get", "key", "devices");
					break;
				}
				case "like": {
					args.push("like");
					break;
				}
				case "connect": {
					if (cleanId) {
						args.push("connect", "--id", cleanId);
					} else if (query) {
						args.push("connect", "--name", query);
					} else {
						// list devices when no id/name given
						args.push("get", "key", "devices");
					}
					break;
				}
				case "playlist_new": {
					if (!query) throw new Error("playlist_new requires a query (playlist name)");
					args.push("playlist", "new");
					if (isPublic) args.push("--public");
					args.push(query);
					if (description) args.push(description);
					break;
				}
				case "playlist_list": {
					args.push("playlist", "list");
					break;
				}
				case "playlist_add": {
					if (!cleanPlaylistId) throw new Error("playlist_add requires playlist_id");
					if (!cleanTrackId) throw new Error("playlist_add requires track_id");
					args.push("playlist", "edit", "--track-id", cleanTrackId, "add", cleanPlaylistId);
					break;
				}
				case "playlist_remove": {
					if (!cleanPlaylistId) throw new Error("playlist_remove requires playlist_id");
					if (!cleanTrackId) throw new Error("playlist_remove requires track_id");
					args.push("playlist", "edit", "--track-id", cleanTrackId, "delete", cleanPlaylistId);
					break;
				}
				case "playlist_delete": {
					if (!cleanPlaylistId) throw new Error("playlist_delete requires playlist_id");
					args.push("playlist", "delete", cleanPlaylistId);
					break;
				}
				default: {
					// exhaustive check
					const _exhaustive: never = action;
					throw new Error(`Unknown spotify action: ${action}`);
				}
			}

			const result = await runSpotify(pi, args, signal, ctx);

			// spotify_player sometimes exits non-zero for benign reasons (e.g. no active device)
			// We'll surface stderr if present and treat non-zero as an error only when stdout is empty.
			let rawOutput = result.stdout;
			if (result.stderr.trim()) {
				rawOutput += (rawOutput ? "\n" : "") + result.stderr.trim();
			}

			if (result.code !== 0 && !rawOutput.trim()) {
				throw new Error(`spotify_player failed (exit ${result.code}): ${result.stderr || "unknown error"}`);
			}

			let output = rawOutput.trim() || "(no output)";

			// --- Smart search result parsing --------------------------------
			if (action === "search") {
				try {
					const data = JSON.parse(output);
					const tracks = data?.tracks;
					if (Array.isArray(tracks) && tracks.length > 0) {
						const lines = tracks.slice(0, 20).map((t: any, i: number) => {
							const artists = t.artists?.map((a: any) => a.name).join(", ") ?? "Unknown";
							return `${i + 1}. "${t.name}" — ${artists} (ID: ${t.id})`;
						});
						let summary = `Top ${lines.length} tracks:\n${lines.join("\n")}`;
						if (tracks.length > 20) {
							summary += `\n\n...and ${tracks.length - 20} more tracks.`;
						}
						output = summary;
					} else {
						output = "No tracks found in search results.";
					}
				} catch {
					// JSON parse failed — keep raw output
				}
			}
			// ----------------------------------------------------------------

			const { text, truncation } = truncateOutput(output);

			return {
				content: [{ type: "text", text }],
				details: {
					action,
					command: args,
					truncation,
				} as SpotifyDetails,
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("spotify_player "));
			text += theme.fg("accent", args.action);
			if (args.query) {
				text += ` "${theme.fg("muted", args.query)}"`;
			}
			if (args.id) {
				text += ` ${theme.fg("dim", `id=${args.id}`)}`;
			}
			if (args.context_type) {
				text += ` ${theme.fg("dim", args.context_type)}`;
			}
			if (args.value !== undefined) {
				text += ` ${theme.fg("dim", String(args.value))}`;
			}
			if (args.playlist_id) {
				text += ` ${theme.fg("dim", `playlist=${args.playlist_id}`)}`;
			}
			if (args.track_id) {
				text += ` ${theme.fg("dim", `track=${args.track_id}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Talking to Spotify..."), 0, 0);
			}

			const details = result.details as SpotifyDetails | undefined;
			let text = theme.fg("success", "✓ Done");

			if (details?.truncation?.truncated) {
				text += theme.fg("warning", " (truncated)");
			}

			if (expanded && result.content[0]?.type === "text") {
				const lines = result.content[0].text.split("\n").slice(0, 30);
				for (const line of lines) {
					text += `\n${theme.fg("dim", line)}`;
				}
				if (result.content[0].text.split("\n").length > 30) {
					text += `\n${theme.fg("muted", "...")}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
