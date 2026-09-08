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

**Controls (all one-finger).**
| Action | How |
| --- | --- |
| Build | Tap a turret card, then tap a build site. Drag before releasing to reposition. |
| Inspect / upgrade / sell | Tap a placed turret. The panel opens on the side away from it. |
| Base upgrades | Tap the glowing core, or the 🛡 button in the top bar. |
| Abilities | Tap the icon on the right rail. Airstrike then asks you to tap a target. |
| Send a wave early | Tap the wave button — the unused prep time is paid out in gold. |
| Speed / pause | Buttons in the top bar (3× unlocks in the skill tree). |

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
