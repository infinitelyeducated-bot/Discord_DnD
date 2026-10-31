# Function Check Report (in progress)

Two automated checks were run against the real code:

- `function-check.cjs`: drives the actual page in a headless browser. **40/40 pass, 0 console errors.**
- `module-check.mjs`: tests each module against what the in-game guide says. **75/80 pass.** Remaining 5 are below.

## Character sheet: all working
Name edit (also updates the top party row), class change, starting points (spend with left-click, reclaim with right-click), whole-number stats, Ready lock (freezes name and class, shows READY), Remove, Add Player (Archer), HP bars, active-player highlight, level badge, all six sheets on one row, no overlapping panels.

## Gameplay in the browser: all working
Move and log, exploring XP only on new tiles, setup locked after first move, movement counter, class ability names and key 1, double End Turn advances exactly one player, monster phase, Rest (disabled only at full HP, as designed), Guard, dice roll to log, chat, minimap, map, fullscreen toggle, pause menu, Game Guide, save, load, network dialog.

## Fixed during this check
1. **Save could not be loaded after "+ Add Player".** A member added after the map was generated had no position, so the save failed validation and showed "No save found". New members are now placed next to the party. The load message also now tells "no save" apart from "save is damaged".
2. **Double End Turn in the browser.** The lock now holds for at least 350 ms so two fast clicks cannot end two turns. Verified in the browser.
3. **Water was impassable** but the guide says it "slows movement". Wading now costs 2 movement points.
4. **Path distance treated the target tile as blocked**, so melee range checks could fail against monsters. Fixed.

## Still open (module check)
| Check | Status |
|---|---|
| Biomes change with depth | Guide says the look changes by biome; `getBiome` returns the same biome for floors 1, 6, 11, 16 because there are 5 biomes and it cycles every 5 floors. Floors 1-5 are all Sewers. Deciding whether to change the cycle or the guide text. |
| Chasm and water impassable | Water is now passable (slows), so this check needs updating, not the game. |
| Pinned monster skips every other phase | Pin logic runs, but my test monster was out of range; verifying. |
| Rest heals 30% and ends turn | Rest works in the browser; the headless test did not wait for the async turn end. Test fix. |
| Up to 2 unused moves carry over | Same async wait issue in the test; verifying. |

Unit tests: 6/6 pass.
