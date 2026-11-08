# Ellenial Party games (family version)

Free party games for families: **PANNBEN** (the forehead game), **Imposter**, **Charades**, **Don't say the same thing**, **Lapp i hatt** (the hat game) and **Wolf in Sheep's Clothing** (Varg i fårakläder, a gentle Mafia/Werewolf). All but Lapp i hatt work offline. Swedish and English, for players who can read (about 8 and up).

Play at **https://partygames.ellenial.app**

Part of Ellenial: free tools made by people, for people. No account, no ads, nothing tracked.

## How it works

- A plain web app: HTML, CSS and JavaScript with no build step and no frameworks.
- PANNBEN is always played sideways. iPhone ignores a web page's request to lock landscape, so when the screen stays portrait the play screen rotates itself and follows which way the phone is turned.
- Don't say the same thing is for two players on one screen, made to look good on a TV or laptop too. A category counts down from 3, both say something from it at once; saying the same thing is a point, fewer is better. A round is 10 categories. "Keep going" continues the same shuffled order (no repeats); "New players" shuffles the categories again. Keyboard: Enter starts, ← same, → different.
- **TV mode** at **tv.ellenial.app** (or any address with `?tv`): opens in a TV's own browser and is played with the remote. Arrows move between buttons, OK presses, Back (also Escape, LG 461, Samsung 10009) leaves. Only shows games that suit one shared screen (now: Don't say the same thing), with one "We're ready!" button instead of two.
- **Lapp i hatt** is played on everyone's own phone. One person creates a game (teams scrambled or chosen, turn length 45 s ± 15, unlimited or max 1–3 skips, an optional 4th "one sound" round, optionally 10 ready-made words) and shares a link or 6-letter code. Everyone adds 3–5 words (only you see yours) and presses Ready; the last one ready starts the game. Rounds: 1 describe with other words, 2 one word, 3 charades, (4 one sound), all with the same words. Teams alternate; when the hat empties, the round ends and the describer keeps their leftover seconds for the next round.
  - It is *not* live: phones check for news every few seconds and only sync between turns. During a turn the describer's phone runs the timer and words on its own, then reports which words were guessed. Everyone else sees whose turn it is, the score, and who's next; the other team is asked to keep quiet and watch for rule breaks.
  - Data: a game lives for up to 24 h in three small `hatt_*` tables in the Gillefeeling Supabase project (`supabase/lapp-i-hatt.sql`). No accounts: each phone keeps a random player token. The tables are closed to the API; the app can only call the `hatt_*` functions, which check that token. Other players' words are only sent once the game starts. All words are deleted the moment a game ends, and whole games (names included) are deleted after 24 h by an hourly job.
- **Wolf in Sheep's Clothing** is Mafia/Werewolf for one phone, passed around, offline. 5–16 players, typed in the order they sit. Wolves (about 1 per 4 players, adjustable) and sheep, plus two optional roles: the **Shepherd** protects one player each night (not the same one two nights in a row; themselves allowed) and the **Sheepdog** sniffs one player each night and sees "wolf" or "not a wolf".
  - No narrator: at night the phone goes to every living player in turn. Wolves pick a sheep and see their packmates' pick (the last wolf's pick counts), the Shepherd and Sheepdog do their thing, and plain sheep tap a name too, so nobody can tell who's who by how long they hold it. Night screens always use the dark palette.
  - Morning says who was taken (or that the Shepherd saved someone), then a gentle talk timer (1–10 min, default 3). The flock points on three and taps a name, or "Nobody today"; the player sent out has their role revealed. Sheep win when no wolves are left; wolves win when they're as many as everyone else.
  - Gentle wording on purpose: sheep are "taken" at night and "sent out of the meadow" by day, and players who are out stay and watch. Names are kept only while you play.
  - Drawings by Ellen (no AI art) in `art/`: wolf, sheep, Shepherd, Sheepdog, the flock and both endings. Before a role is shown everyone sees the same plain fleece (the sheep's outline), so a glimpse gives nothing away.
  - The rules live at the top of `wolf.js` with no screen code, and `node tests/wolf.test.js` plays 20,000 random games against them.
- Open it once, add it to your home screen, and it keeps working with no internet (a service worker caches every file).
- Apart from Lapp i hatt: no server, no database. Names typed for a game are forgotten when it ends. Your own word packs are saved only in that phone's browser storage.
- The Ellenial look (final, 1 Nov 2026): the shared Ellenial palette in light and dark (Peach, Card, Lavender, Periwinkle, Indigo, Night), Fraunces for headings and DM Sans for text (SIL Open Font License), served from this site so no font service sees who plays.
- Auto / Light / Dark switch on the home screen, the shared `ellenial-theme.js` from ellenial maps. Saved on this phone only. Add `?theme=light` or `?theme=dark` to test.
- Each game's card on the home screen (and the TV home) shows Ellen's drawing for that game, in place of the old line icons; "Your packs" gets the make-your-own drawing. Drawn by hand, no AI art; the same files are in the shared set at ellenial.app/drawings.
- Accessibility: text at least 4.5:1, buttons, inputs and outlines at least 3:1, and nothing relies on colour alone (✓ / ✕, = / ≠, ☀ Sun / ☾ Moon).

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app |
| `hatt.js` | Lapp i hatt (the only part that talks to a server) |
| `art/` | Ellen's drawings (webp, transparent): Wolf in Sheep's Clothing roles and endings, plus one per game on the home screen (`game-*.webp`, 8 Nov 2026; also at ellenial.app/drawings) |
| `wolf.js` | Wolf in Sheep's Clothing (rules at the top, then the screens) |
| `tests/wolf.test.js` | Plays thousands of random Wolf games to check the rules |
| `supabase/lapp-i-hatt.sql` | Lapp i hatt's tables and functions |
| `copy/en.json`, `copy/sv.json` | Every word the app shows, one file per language |
| `packs/en.json`, `packs/sv.json` | Word packs, one file per language; Swedish packs are written on their own, not translated |
| `ellenial-help.js`, `ellenial-help.css` | The shared Ellenial "?" (from ellenial-bingo, copied unchanged): "How it works" in three steps, only when someone taps it. On the home and setup screens, never on TV or during play. Text in `copy/*.json` under `help` |
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

A static site on Vercel's free tier, plus Lapp i hatt's small tables inside the existing Gillefeeling Supabase project (free tier): close to zero. Stated openly, as all Ellenial apps do.

## Licence

AGPL-3.0-only, the same as the Ellenial site. See `LICENSE`. The fonts in `fonts/` keep their own SIL Open Font License (see the licence files there).

The Ellenial name and logo aren't covered by the code licence, see [TRADEMARK.md](TRADEMARK.md).

## Credits

- Product and design: Ellen Nilsson
- Code: written with Claude
- Icon: placeholder shapes until a person draws the real one
- Fonts: Fraunces (The Fraunces Project Authors), DM Sans (The DM Sans Project Authors), SIL OFL 1.1
