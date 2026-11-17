# Bella, a co-op game for one player

My personal site, built as a small split-screen game.

One set of keys moves two characters through two worlds. On the left, a scientist in cobalt ink on lab-notebook paper. On the right, an engineer in amber phosphor on a terminal. Each world holds what the other one needs: a question for a script, a dataset for a hypothesis, a review for a merge. At the end you hold one key, the seam zips shut, and the two halves turn into a single blueprint.

## Play

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

- Move: arrow keys, or A and D
- Jump: space
- Merge, at the end: hold space
- On a phone: on-screen buttons appear
- In a hurry: "Skip to the ending" goes straight to the résumé

## Edit the story

Everything you'd want to change lives in [`js/story.js`](js/story.js):

- `CONFIG.links`: GitHub, LinkedIn, email. Empty ones aren't shown.
- `CHAPTERS` and `BEATS`: the words each side says, and where in the level they say them.
- `WHOLE`: the page after the merge (about, path, skills, side quests).
- `LEVEL`: crates, pickups, bugs, gates and pits, in world units.

## How it's made

No build step, no frameworks, no image or audio files.

| File | What it does |
| --- | --- |
| `index.html` | The page, and the two halves of the interface |
| `css/style.css` | Type and layout for both voices and the merged page |
| `js/story.js` | Words and level layout |
| `js/render.js` | Draws both worlds and the merged one on a canvas |
| `js/game.js` | Input, physics, the seam, the merge |
| `js/audio.js` | Synthesised sound: the scientist in your left ear, the engineer in your right, both in the centre after the merge |

It respects `prefers-reduced-motion`, works with keyboard or touch, and falls back to a short bio without JavaScript.

## Publish on GitHub Pages

Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.

## Fonts

[Old Standard TT](https://fonts.google.com/specimen/Old+Standard+TT) and [Martian Mono](https://fonts.google.com/specimen/Martian+Mono), both under the SIL Open Font License, self-hosted in `fonts/`.
