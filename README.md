# Iron Bastion

A touch-first tower defense game built for tablets. Pure HTML5 canvas + vanilla
JavaScript — no build step, no dependencies, no asset downloads.

![sectors](https://img.shields.io/badge/sectors-4-blue) ![towers](https://img.shields.io/badge/towers-8-green) ![modes](https://img.shields.io/badge/modes-campaign%20%2B%20endless-purple)

## Play it

Open `index.html` in a browser. That is the whole install.

On a tablet, the nicest way is to serve the folder from any machine on the same
network and open it in Safari/Chrome, then **Add to Home Screen** — it runs
full screen with no browser chrome:

```bash
cd tower-defense
python3 -m http.server 8000
# then browse to http://<your-computer-ip>:8000 on the tablet
```

Progress (research points, unlocks, best endless waves, settings) is saved to
`localStorage` on the device.

**Screen sizes.** Landscape, any size. On roomy tablets the turret bar runs
along the bottom; on shorter screens (small Android tablets, phones) it moves
to a vertical rail beside the field, which buys back the vertical space that
matters most there. The game measures both layouts and keeps whichever gives
the bigger field, so there is nothing to configure. Screens with width to
spare also get a wider field — sectors are authored on 20x12 tiles and grow
to as many as 24 columns, so the approach lane starts further out and there
is more room to build rather than empty margin. Pinch to zoom in when the
tiles are small for your fingers.

## The game

**Goal.** Enemies walk the road toward your core. Stop them. Anything that
reaches the core takes a bite out of its integrity, and leaks hurt more the
deeper into the run you are.

**Modes.**
- **Campaign** — four sectors of 25–35 hand-built waves. Clearing one unlocks
  the next.
- **Endless** — the same maps with no wave limit. Enemy health, armor and count
  keep climbing; a boss arrives every 10 waves and a Titan every 20 after wave
  30. Your best wave per sector is recorded.

**Generated layouts.** On by default. Every sector card in the picker previews
a freshly generated road, in one of two shapes: a winding serpentine, or a
long road that doubles back on itself in three sweeps (sometimes with a
detour part-way along that leaves a pocket of build sites inside it). Turn
spacing, row bands, the core approach and the rock scatter are all rolled,
and the harder sectors can get a second lane that merges into the first. **Reroll** rolls new ones for every sector at once; **Shuffle:
OFF** gives you the authored maps back. A layout is identified by a short seed
(`#7A97`) shown on the card and in the pause screen, and Try Again replays the
same one. The sector's theme, threat multiplier, wave count and progression are
unchanged — only the ground is new — and the seed also varies the wave
composition, so a reroll is a different fight rather than just a different road.
Generated layouts are validated before they are offered: road length, build-site
count, self-overlap and lane overlap all have to pass, and the gentler sectors
hold a longer minimum road and never get a second lane.

**Controls (all one-finger).**
| Action | How |
| --- | --- |
| Build | Tap a turret card, then tap a build site. Drag before releasing to reposition. |
| Inspect / upgrade / sell | Tap a placed turret. The panel opens on the side away from it. |
| Base upgrades | Tap the glowing core, or the 🛡 button in the top bar. |
| Abilities | Tap the icon on the right rail. Airstrike then asks you to tap a target. |
| Send a wave early | Tap the wave button — the unused prep time is paid out in gold. |
| Speed / pause | Buttons in the top bar (3× unlocks in the skill tree). |
| Zoom | Pinch to zoom, drag to pan once zoomed, or the ⤢ button to toggle 2×. |

## Depth

**8 towers**, each with 5 levels and a **branching specialisation at level 3**
that changes how it behaves, not just its numbers:

| Tower | Role | Paths |
| --- | --- | --- |
| Autogun | cheap rapid fire, air + ground | Shredder (strips armor) / Overdrive (+70% rate) |
| Cryo Emitter | slows everything it touches | Absolute Zero (freeze) / Brittle Field (+30% damage taken) |
| Mortar | heavy splash, ground only | Siege Shell / Cluster Bomb |
| Arc Tower | chain lightning, half-ignores armor | Chain Master / Overcharge (stun) |
| Pyro Vent | short-range burn cone | Napalm (ground fire) / Thermite (armor melt) |
| Hydra Pod | homing missiles, anti-air | Swarm Rack / Bunker Buster |
| Railgun | long-range, ignores 75% armor | Penetrator (pierces a line) / Headhunter (boss killer) |
| Command Beacon | support aura, does not shoot | Overclock (rate) / Targeting Array (range + crit) |

Each turret also has four targeting priorities: first, last, strongest, closest.

**Base upgrades** bought with gold during a run: armor plating, repair drones,
a refinery for extra income, a shock pylon that zaps anything near the core, and
a rechargeable barrier field.

**Skill tree** — permanent progression bought with Research Points earned every
run, split across Offense, Economy and Fortification. It unlocks four of the
eight towers, all four abilities (Airstrike, Cryo Nova, Field Repair,
Overdrive), 3× speed, and stacking bonuses to damage, rate, range, crit,
income, core integrity and shields. Respec is free at any time.

**14 enemy types** including flyers that ignore the road entirely, shielded
Aegis units, Menders that heal their neighbours, Hives that split when killed,
armor-heavy Brutes, physical-resistant Wraiths, and three boss classes.

## Layout of the code

| File | What's in it |
| --- | --- |
| `js/config.js` | All balance data — towers, enemies, wave generation, base upgrades, abilities, skill tree |
| `js/maps.js` | Grid geometry and the four sector definitions |
| `js/mapgen.js` | Procedural sector layouts, validated and seeded |
| `js/entities.js` | Enemy, Tower and Projectile behaviour |
| `js/game.js` | Run state, economy, wave flow, rules |
| `js/render.js` | Canvas drawing (cached backgrounds and glow sprites) |
| `js/ui.js` | DOM screens, HUD, touch input |
| `js/save.js` | localStorage progression |
| `js/audio.js` | Small WebAudio blip synth |

Tuning the game means editing `js/config.js` — the numbers all live there.
The playfield is a fixed 20×12 tile grid (1280×768 logical units) scaled to
fit any screen, so touch coordinates and layout stay consistent across
devices. The grid's 1.67:1 shape is deliberately close to a tablet's own
aspect ratio — a wider field would letterbox into a strip and shrink every
tile. The canvas backing store is sized from the display's pixel density
(capped at 1.6x) in `Render.resize`.
