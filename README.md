# Bella, a co-op game for one player

My personal site, built as a small 3D split-screen game.

The screen is cut in two. On top is the surface world (表世界): the real world, a desk in daylight, where **Forward** is in the room with the customer. Underneath is the code world (里世界): the same desk at night, where **the engineer** ships the fix. Each world holds the switches for the other one. At the end both stand on their marks, the seam opens, and the two turn out to be one forward deployed engineer.

## Play

Serve the folder and open it (it uses ES modules, so opening the file directly won't work):

```
python3 -m http.server 8000
```

| | Forward (top) | The engineer (bottom) |
| --- | --- | --- |
| Move | A, D | ←, → |
| Jump | W | ↑ |

Space jumps both. On a phone each player gets a cluster of buttons, one thumb each. "Skip to the ending" goes straight to the résumé.

What you'll meet along the way:

- **Plates** open the other player's door, raise their lift, or hold their bridge, but only while you stand on them.
- **Carry rails**: while one player walks the arrows, the other's platform moves. Step on and ride.
- **Paired marks**: both players press at once to open both doors.
- **Bugs**: jump on them.
- **Feedback and fixes**: in the last chapter, each piece of customer feedback Forward collects clears a blocker for the engineer, and each fix the engineer ships gives Forward ground to stand on.

## Edit the story

Everything you'd want to change lives in [`js/story.js`](js/story.js):

- `CONFIG.links`: GitHub, LinkedIn, email. Empty ones aren't shown.
- `CHAPTERS` and `BEATS`: the words each player says, and where in the level they say them.
- `WHOLE`: the page after the merge (about, path, skills, side quests).
- `LEVEL`: ground, blocks, plates, doors, lifts, bridges, bugs and pickups, in metres.

## How it's made

No build step, no model, image or audio files.

| File | What it does |
| --- | --- |
| `index.html` | The page, and the two halves of the interface |
| `css/style.css` | Type and layout for both voices and the merged page |
| `js/story.js` | Words and level layout |
| `js/world.js` | Builds the three 3D worlds out of simple shapes |
| `js/game.js` | Input, physics, puzzles, and the shader that cuts and merges the screen |
| `js/audio.js` | Synthesised sound: one player in each ear, both in the centre after the merge |
| `vendor/` | [three.js](https://threejs.org) (MIT), bundled |

Each world is rendered with real-time lights and shadows into its own texture; a small shader joins them along the seam, adds glow, and opens the merged world outward at the end. It respects `prefers-reduced-motion`, works with keyboard or touch, and falls back to a short bio without JavaScript.

## Fonts

[Old Standard TT](https://fonts.google.com/specimen/Old+Standard+TT) and [Martian Mono](https://fonts.google.com/specimen/Martian+Mono), both under the SIL Open Font License, self-hosted in `fonts/`.
