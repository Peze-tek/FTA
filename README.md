# FAP THEFT AUTO (FTA)

3D third-person Telegram Mini App. Next.js 14 + TypeScript + Three.js (@react-three/fiber + drei) + Zustand + Tailwind.
**Fake price only. No real crypto, no wallets.**

## Run
```bash
npm install
npm run dev      # http://localhost:3000   (add ?touch=1 to force the mobile overlay on desktop)
npm run build    # Vercel-ready
```
Deploy to Vercel, then set the URL as your bot's Mini App (BotFather -> /newapp or menu button).

## Build status (roadmap, ~1/4 done)
| Part | Status |
|---|---|
| Engine: store, input (WASD/mouse + joystick), Telegram SDK (ready/expand/haptics/CloudStorage), PriceSystem, colliders, interactions | done |
| Toon low-poly rigs: Jack, Brandon, Pol, Robofap, Paper Hands, Meast, Tek (+ Rugpull, guard, bear, worker stubs) | done |
| ThirdPersonController, CutsceneManager (camera dolly), HUD (ticker, candles, market cap, crew avatars), dialogue, menu | done |
| City: 4 districts, streamed + price-unlocked, instanced buildings, fog, lamps | done |
| **Level 1 - RECRUIT** (locked order, orbs, Tek AI call-center hack, rooftop dolly cutscene) | **done** |
| Level 2 - CAPTIVE & DUMP: `lib/StealthSystem.ts`, basement map, patrolling guards, 13 cages / 200 OGs, Meast Hold-F QTE | **step 1 done** |
| Level 2 dump puzzle (`lib/dumpPuzzle.ts`, lookalike-wallet decoy, FAPCOIN trap) + Pol livestream overlay + pump to $3.20 | **step 2 done** |
| Level 3 - BEARS: `lib/CombatSystem.ts` (punches, enemy AI, `MeastMode()`), bridge arena, short-squeeze puzzle (`lib/squeezePuzzle.ts`) → $28 | **step 3 done** |
| Level 4 - RED CANDLE RACE: `lib/RaceSystem.ts` (lane switch, RedCandleDebuff, barrels), moped + sidecar, USB QTE → $89 + CEX LISTED | **step 4 done** |
| Level 5 - FINAL: find a pistol (Tek's crate), gun down Rugpull's 11-man crew in 2 waves (`lib/GunSystem.ts`), then the 3-phase boss fight (`lib/DuelSystem.ts`), ending cutscenes | **done** |

Add a level: create `src/game/levels/LevelN.tsx`, register it in `LEVELS` (`components/GameCanvas.tsx`), bump `BUILT_LEVELS` in `lib/store.ts`.

## Layout
- `src/app` - Next app router shell (Telegram SDK script in layout)
- `src/components` - ThirdPersonController, CutsceneManager, HUD, MobileControls, DialogueBox, overlays
- `src/game` - levels, world (City, Atmosphere), characters, data (districts, quests, cutscenes)
- `src/lib` - PriceSystem, store, input, telegram, colliders, interact, anim

## Performance notes
No real-time shadows (blob shadows), instanced buildings/props/lamps, shared toon materials, drei `<Detailed>` LODs on NPCs, adaptive DPR via `PerformanceMonitor`, districts streamed in/out by distance and price.

## Note on `_previous_attempt/`
An earlier session left a different, incompatible draft in this folder (Level 2 stealth view, Combat/Stealth/Race systems,
minigames, fireworks...). It is parked in `_previous_attempt/` (excluded from the build) so nothing is lost; useful parts can be
ported when Levels 2-5 are built on top of the current engine.


## Extras
- **Player name**: asked on first launch (saved in localStorage; change via ✎ on the menu).
- **Survival mode** (menu → SURVIVAL): endless rooftop waves, pistol from the start, only kills count; best score saved locally (`src/game/levels/Survival.tsx`).
- **Level 4** is now a sports-car race on a winding road with oncoming civilian traffic (head-ons cost speed + 10% price; near misses refill boost).
- Hero renamed **JACK** (internal id stays `jake`).
- **Survival** now plays on the Lagos Market street (Level 1 city) with 4 weapon crates (SMG, shotgun, rifle, railgun); swap with Q/X/Tab/wheel/1-5 or the weapon bar. Logic: `src/lib/WeaponSystem.ts`.
- **HUD** restyled GTA-mobile style: round radar + health bar (top-left), money-style price/kills + weapon box + stars (top-right), round icon buttons.
- **Graphics upgrade (GTA-style look)**: Level 1 city + Survival render in golden hour, the Level 4 race in bright daytime; other levels keep the night mood with upgraded PBR materials. Procedural sky with clouds + sun, baked environment reflections, real-time sun shadows, procedural asphalt/sidewalk/grass/glass-facade textures, palms/trees, parked cars, crosswalks and traffic lights. No new dependencies. Menu top-left **GFX: LOW/MED/HIGH** toggles quality (touch devices default to MED; use LOW if it lags). Presets live in `src/lib/atmo.ts`, quality tiers in `src/lib/quality.ts`, textures in `src/lib/textures.ts`.
- Survival now spans the whole city (all districts open, no fence, 9 weapon crates); enemy name tags hide on death.
- **FREE PLAY** (menu → FREE PLAY): open city sandbox. Enter any of 14 cars with E (W/S gas/brake, A/D steer, Shift nitro, Space handbrake; mobile: joystick, JUMP = handbrake, SWAP = nitro, tap the ENTER/EXIT prompt), run over or shoot Rugpull's crew, grab weapon crates, clear 5 crew camps (red rings on the minimap). Code: `src/game/levels/FreePlay.tsx`.
- **Mobile**: landscape only — portrait shows a 'turn your phone sideways' screen and pauses the game. In Free Play cars the touch controls are LEFT/RIGHT, GAS, REVERSE and FIRE (shoot from the car). Free Play is endless: clear all 5 camps and the next wave returns tougher (more HP, damage, reinforcements).
- **Level 1 world**: the city is deeper (6 building rows, 184 m wide) with side streets and alleys (`ROUTES` in `src/game/data/districts.ts`). Recruits wait at the end of routes that need a couple of turns, so you follow the objective marker/minimap off the main street.
- **Free Play** now includes the side streets: 3 alley camps (8 total), 5 extra weapon crates and 4 more cars down the side streets.


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


## Transitions
`lib/transition.ts` + `components/TransitionLayer.tsx`: fade-through-black from the menu into any mode and back (`transitionTo`), automatic black dips that hide every scene swap (level / mode / screen change, game over, to-be-continued, cutscene start/end), cinematic letterbox bars that slide in during cutscenes, a fade to black before each cutscene ends, and the gameplay camera snaps to the player after a cutscene instead of flying over. Music now crossfades between themes (`music.play`), and dialogue / minigame / result panels fade in.
- **Full city (Survival + Free Play)**: the open modes now run in a much bigger city (x -135..435, z ±230): ring roads, 2 extra avenues each side of downtown, 4 cross streets, filled city blocks, a central park with ponds, street trees/lamps/parked cars, 6 new Free Play camps, crates and cars, and a bigger minimap. Level 1 keeps its original district-gated layout. Code: `src/game/world/OuterCity.tsx`, constants in `src/game/data/districts.ts`.
- **Fists / no weapon (Survival + Free Play)**: press 0 or H (or tap FISTS in the weapon bar) to put the gun away — Jack walks in a normal stance and punches; swap (Q/X/Tab/SWAP button) cycles FISTS → your weapons. Weapon stance: arms raise with recoil when armed (`Character.tsx`).
- **Map labels**: districts, every landmark, streets/ring roads, parks and (Free Play) camp names are tagged on the full map; the radar shows district + landmark names. Data in `cityLabels()` (`src/lib/nav.ts`).
- **Car damage**: crashes (walls, props, other cars) and enemy fire hurt cars — they crumple, smoke below 60% HP, burn below 25% and explode at 0 (blast hurts crew and ejects the driver); wrecks stay as burnt shells that can't be driven. Code: `src/lib/carDamage.ts`, `src/game/world/CarView.tsx`.
- **Island + denser city (Survival / Free Play)**: the city is an island ringed by a 30 m beach (sand, wet sand, animated foam, sea with drifting ripples, palms, umbrellas, loungers, huts, lifeguard towers, rocks, boats, buoys, a lighthouse). You stop at the shoreline. The outer city is filled in: street furniture (benches, bins, hydrants, bus shelters), neon shop signs, verges, pocket parks, plazas with fountains, more parked cars/lamps. Code: `src/game/world/Island.tsx`, `CityDetail.tsx`, `OuterCity.tsx`; `ISLAND`/`PLAZAS` in `districts.ts`.
- **Rugpull special agents (Free Play)**: at 4★ wanted two black-suited, shaded agents hunt you (up to four at 5★). Tough, fast, and they fire accurate 3-round bursts; they vanish when your heat drops below 4★. Code: `AGENT`/`makeAgent` in `src/lib/GunSystem.ts`, spawn logic in `FreePlay.tsx`.
