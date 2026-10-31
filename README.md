# Ellenial Party games (family version)

Free party games for families that work offline: **PANNBEN** (the forehead game), **Imposter**, **Charades** and **Don't say the same thing**. Swedish and English, for players who can read (about 8 and up).

Play at **https://partygames.ellenial.app**

Part of Ellenial: free tools made by people, for people. No account, no ads, nothing tracked.

## How it works

- A plain web app: HTML, CSS and JavaScript with no build step and no frameworks.
- PANNBEN is always played sideways. iPhone ignores a web page's request to lock landscape, so when the screen stays portrait the play screen rotates itself and follows which way the phone is turned.
- Don't say the same thing is for two players on one screen, made to look good on a TV or laptop too. A category counts down from 3, both say something from it at once; saying the same thing is a point, fewer is better. A round is 10 categories. "Keep going" continues the same shuffled order (no repeats); "New players" shuffles the categories again. Keyboard: Enter starts, ← same, → different.
- Open it once, add it to your home screen, and it keeps working with no internet (a service worker caches every file).
- No server, no database. Names typed for a game are forgotten when it ends. Your own word packs are saved only in that phone's browser storage.
- Same look as Gillefeeling: colours from Ellen's flower logo (cream, indigo, lavender), Fraunces + Instrument Sans (SIL Open Font License), served from this site so no font service sees who plays.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app |
| `copy/en.json`, `copy/sv.json` | Every word the app shows, one file per language |
| `packs/en.json`, `packs/sv.json` | Word packs, one file per language; Swedish packs are written on their own, not translated |
| `sw.js` | Offline cache. Bump `VERSION` when any file changes |
| `fonts/`, `icons/` | Self-hosted fonts with their licences; placeholder icon |

## Word packs

Each pack lists which games it works in and has easy, medium and hard words:

```json
{ "id": "animals", "name": "Animals", "games": ["imposter", "charades", "pannben"],
  "levels": { "easy": ["cat"], "medium": ["hedgehog"], "hard": ["axolotl"] } }
```

In Imposter, the pack name is the hint the imposter sees. Each pack file also has a `categories` list used by Don't say the same thing. The current packs are **drafts** and will be edited before the first public release.

## Run it locally

Any static file server works, for example `npx serve .`, then open the address it prints.

## Running cost

A static site on Vercel's free tier: close to zero. Stated openly, as all Ellenial apps do.

## Licence

AGPL-3.0-only, the same as the Ellenial site. See `LICENSE`. The fonts in `fonts/` keep their own SIL Open Font License (see the licence files there).

## Credits

- Product and design: Ellen Nilsson
- Code: written with Claude
- Icon: placeholder shapes until a person draws the real one
- Fonts: Fraunces (The Fraunces Project Authors), Instrument Sans (The Instrument Sans Project Authors), SIL OFL 1.1
