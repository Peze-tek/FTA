# FAP THEFT AUTO — A CRYPTO HEIST

A 3D third-person **Telegram Mini App** game. Rescue the FAPCOIN from Rugpull, take the price from **$0.01 to $1000**, and
own Fap City. Built with Next.js 14, TypeScript, React Three Fiber, Zustand and Tailwind.

> **Fake price only. No real crypto, no wallets, no transactions.** FAPCOIN is a fictional in-game number.

## Game modes
| Mode | What it is |
|---|---|
| **Story (5 levels)** | 1 Recruit · 2 Captive & Dump (stealth + puzzle) · 3 Bears (brawl) · 4 Red Candle Race (sports cars, oncoming traffic) · 5 Final Duel (gunfight + 3-phase boss) |
| **Survival** | Endless waves of Rugpull's crew on the Lagos Market street. Only kills count. Collect SMG / shotgun / rifle / railgun crates and swap between them. |
| **Free Play** | The whole city is open: drive any car, loot weapons, clear 5 Rugpull camps. |

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move / look | WASD · mouse (click to lock) | joystick · drag pad |
| Interact / enter car | E | tap the prompt / ACT |
| Attack / fire | J or click | FIRE / PUNCH |
| Jump / handbrake | Space | JUMP |
| Swap weapon / nitro | Q · X · Tab · wheel · 1-5 | SWAP |
| Run / nitro | Shift | – |

## Getting started
```bash
npm install
npm run dev        # http://localhost:3000   (add ?touch=1 to preview the mobile controls on desktop)
npm run build      # production build (Vercel-ready)
npm run lint       # type-check
```
Requires Node 18.17+.

## Deploy + connect to Telegram
1. Import the repo into [Vercel](https://vercel.com) (framework: Next.js, no env vars needed) — you get an HTTPS URL.
2. In **@BotFather**: `/newapp` (or *Bot Settings → Menu Button*) and paste the URL.
3. Optional `/start` button for a bot:
   ```python
   InlineKeyboardButton("🎮 PLAY", web_app=WebAppInfo(url="https://your-app.vercel.app"))
   ```

## Graphics quality
Menu → **GFX: LOW / MED / HIGH**. Phones default to MED; use LOW if it lags (turns shadows off). The renderer also adapts
resolution automatically. Everything (sky, textures, trees, cars) is procedural — there are no model or texture files.

## Project layout
```
src/app          Next.js app-router shell (Telegram SDK script in layout.tsx)
src/components   HUD, MainMenu, GameCanvas, ThirdPersonController, MobileControls, overlays, audio director
src/game         levels/ (Level1-5, Survival, FreePlay) · world/ (City, Atmosphere, foliage) · characters/ · data/
src/lib          pure game logic: store, PriceSystem, CombatSystem, GunSystem, WeaponSystem, RaceSystem, StealthSystem,
                 DuelSystem, audio (synth music + sfx), input, colliders, textures, quality, atmo
public           mascot + graffiti artwork
scripts          optional screenshot helper
```
Add a level: create `src/game/levels/LevelN.tsx`, register it in `LEVELS` (`components/GameCanvas.tsx`) and bump
`BUILT_LEVELS` in `lib/store.ts`.

## Credits
All music and sound effects are synthesised in the browser (Web Audio). Characters, city and cars are built from code.
Mascot and graffiti artwork in `public/` is the project's own art.

## License
MIT — see [LICENSE](LICENSE). The characters, names and story are fictional; any resemblance to real tokens is parody.

## Mobile
Landscape only: in portrait a "turn your phone sideways" screen pauses the game. In Free Play cars the touch controls are
LEFT / RIGHT, GAS, REVERSE and FIRE (you can shoot from the car). Free Play is endless — clear all 5 camps and the next
wave returns tougher.

## Level 1 layout
The Lagos / London / Port Harcourt blocks are deeper than the main street: side streets and alleys (`ROUTES` in
`src/game/data/districts.ts`) lead to the recruits, so you follow the objective marker and minimap through a couple of turns.


## Cars in Level 1
Sixteen parked cars (sports cars, sedans, vans, pickups) line the main street and side streets. Walk up and press **E** (or tap the prompt) to get in; **W/S + A/D** drive, **Shift** nitro, **Space** handbrake, **E** to get out when slow. On mobile the controls switch to steer + gas/reverse. Driving over orbs collects them. Reusable system: `src/game/world/Vehicles.tsx`.


## Smoother visuals
Cars and characters use bevelled boxes (`src/game/RBox.tsx`, cached per size) instead of hard-edged cubes, wheels/heads/limbs have higher segment counts, and anti-aliasing is now on for Medium and High quality (Low stays off for weak phones).


## Camera
Survival and Free Play now use the same free over-the-shoulder camera and look pad as Level 1 (no forced enemy lock-on). While you shoot, your character auto-turns toward the nearest enemy.


## Combos and Wanted level
- **Combo (Survival + Free Play):** kills within 3.5 s chain. Callouts: DOUBLE KILL, TRIPLE KILL, QUAD KILL, RAMPAGE, UNSTOPPABLE, GODLIKE. Multiplier x1.5 -> x5 feeds a SCORE; combos of 3+ heal 4 HP per kill. Game over shows score + best combo. Logic in `src/lib/combo.ts`.
- **Wanted level (Free Play only):** every kill adds heat (0-5 stars, shown on the HUD). Higher stars wake crew camps from farther away, and from 2 stars hunter squads spawn on the street and chase you (up to 2x stars-1 at a time). Heat cools after ~10 s without kills.


## Opening scene: the boardroom
A new game opens with a ~30 s cutscene in Rugpull's private boardroom: he pitches his next rug ($MOONSCAM) to KOLs, a market maker, an exchange CEO, a VC and a launchpad (all fictional). Defined in `game/data/cutscenes.ts` (`boardroom`) with the stage in `components/CutsceneManager.tsx` (`BoardroomStage`). It plays once per new run, before Jack finds the laptop, and has a SKIP button. `Character` accepts a `look` prop for one-off recolours.


## Final fight audio + slow-mo
- Rain bed is much quieter (0.12 -> 0.045) and fades lower during the ending.
- New `battle` music theme plays once the boss fight starts in Level 5; a synthesised **battle cry** (`sfx.battleCry`) fires at the start of the fight and at each new phase.
- Rugpull's death plays in slow motion (~3.6 s): world, his fall animation and the music tempo slow down (`lib/timeScale.ts`), the camera pushes in, then everything eases back before the ending dialogue.


## Pause
Tap the radar (or press P / Esc) for a full-screen PAUSED map with RESUME and MENU. The districts map (phone button, Level 1) pauses too. While paused the 3D scene stops rendering, audio is suspended and held/queued input is cleared. State lives in `store.paused`.


## Homeless NPCs (Level 1)
Seven people wrecked by Rugpull's rugs: some sit on the sidewalk in blankets beside a cardboard sign, others shuffle up and down the pavement and stop now and then. Walk up and press E (or tap the prompt) to hear their story. Those in District 2 appear once it unlocks. See `src/game/world/Homeless.tsx`.


## Tree placement
Trees and bushes are kept out of the side-street/alley mouths (`inSideStreetMouth` in `City.tsx`), set slightly further back from the sidewalk, and given more clearance around landmark buildings.


## Dramatic sound
Cutscene shots carry sound cues (`sfx: [...]` in `cutscenes.ts`): drones, heartbeat, riser swells, orchestral hits, cinematic booms, crowd murmur, cash, keyboard, tech zaps; every camera cut also gets a whoosh. New synth SFX in `audio.ts`: `boom`, `riser`, `drama`, `drone`, `murmur`, `cash`, `zap`, `keys`, `comboHit`. Gameplay: boss phase changes and Rugpull's death hit with booms, combos climb in pitch, 3-star wanted level gets an orchestral hit, and game over lands with a boom.


## Rugpull staff (Level 1, Survival, Free Play)
Suited employees pace the sidewalks of every district holding a placard that reads **WEN GEMPUMP?**, waving it when they stop. In Level 1 you can press E to chat (each has their own line); in Survival and Free Play they're scenery. Level 1 shows staff in a district once it unlocks. See `src/game/world/RugStaff.tsx`.
