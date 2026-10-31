# PixelBear Dungeon Crawler: Level 30 Playtest Report

**How it was played:** a headless bot (`playtest-bot.mjs`) drives the real game modules: it moves, uses class abilities, rests, drinks potions and takes stairs. It checks game rules after every action. Short probe scripts (`probe*.mjs`) confirm single bugs.

## Fixed (verified)

### 1. Pressing End Turn twice skipped the next player
**Fix:** a turn lock (`game.turnEnding`). While the monster phase runs, every player action (move, attack, rest, guard, abilities, End Turn) is ignored. The lock is cleared when the save is loaded so a save made mid-phase can't freeze the game.
**Verified:** active A, two quick End Turn presses, active becomes **B** (before the fix it became C).

### 2. Poison Vial did not poison
**Fix:** poisoned monsters now take 8% of max HP (min 1) per monster phase for 3 turns and the log reports each tick. A monster that drops to 0 "succumbs to poison".

### 3. Pinning Shot did not slow
**Fix:** pinned monsters lose every other monster phase for 3 turns; the log says the monster "is pinned and cannot act".

### 4. Fractional HP and stats after levelling
**Fix:** the "+0.5 to other stats" is now banked as a half-point and becomes +1 every second level, so stats and HP stay whole numbers. Old saves are rounded on load. Guide and startup message updated.

### 5. Levelling to 30 by pacing back and forth
**Fix:** movement XP (3) is only given the first time a tile is stepped on. Revisiting earns nothing. The guide now calls this "exploring". Bot runs confirm zero XP from repeat movement.

### 6. NEW: stairs and monsters could be unreachable (found during the rerun)
Chasms `≡` and water `~` were dropped onto random floor tiles, including 1-wide corridors, which cut off whole regions. In a sample of 40 generated floors, 4 exits and 8 monsters were unreachable.
**Fix:** terrain is only placed where every floor tile stays connected.
**Verified:** 0 disconnected floors in 60 generated maps.

## Still running
The full level-30 run is in progress. With the XP change, the party now has to explore and fight to level (the party reached floor 19 and levels 7–10 in one run before the bot got stuck on its own pathing, not a game bug). Untested so far: boss floors, Hard/Nightmare permadeath, death saves, shrine revives.

## Tests
- Unit tests: 6/6 pass.
