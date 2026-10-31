# PixelBear's ASCII Dungeon Crawler

A party-based ASCII dungeon crawler that runs in the browser. Supports local play and LAN/WAN multiplayer via WebRTC.

## Quick start

Double-click **`Run_Game_Server_PixelBear_Dungeon_Crawler.cmd`**. The word *Server* is in the name on purpose: this launcher starts a **network-accessible server**, so it first shows a red warning screen (what it starts, the port, and that other devices on your network can reach it) and only continues if you type `YES`. Anything else cancels and nothing is started. After you confirm, it installs dependencies on first run, starts the server and opens the game in your browser. Keep its window open while you play; close it to stop the server.

Playing alone? Use the single-file edition below instead, which opens a page and starts no server.

Or by hand:

```bash
npm install
npm start
```

Then open http://localhost:8080/crawler.html. The game must be served over http: opening `crawler.html` straight from the disk shows a help screen instead of the game, because browsers block ES modules from `file://`.

### Single-file edition

Want to play from a double-click with no server? Use **Ascii Dungeon Crawler**, the single-file edition built from this code with `node build-single-file.cjs`. It is identical except that networking is removed: https://github.com/infinitelyeducated-bot/Ascii_Dungeon_Crawler

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Move up |
| A / ← | Move left |
| S / ↓ | Move down |
| D / → | Move right |
| F | Attack nearest target |
| R | Rest and heal |
| G | Stand guard |
| E | End turn |
| Esc | Pause menu |

On mobile devices, the on-screen D-pad and action buttons replace the keyboard shortcuts.

## User interface

The screen layout is arranged around the central dungeon map:

- **Top center** – character name/avatar row and the dungeon level title.
- **Top left** – map key / legend.
- **Top right** – party loadout / inventory panel.
- **Center left** – party chat, party setup, and minimap.
- **Center** – the ASCII dungeon map with a fullscreen toggle (⛶).
- **Center right** – player options and adventure log.
- **Bottom (below the main box)** – party character sheets in a compact horizontal stat format.

The currently active character sheet is outlined in **yellow** and tinted by status effects (green poison, red stun, gold bless, teal haste, orange slow). Character sheets use a compact horizontal stat format while playing; the larger blocky sheet format is reserved for printing.

### Party setup

- Use the **New member class** dropdown and **+ Add Player** to choose a class when adding characters.
- Each character's **name is edited directly at the top of their sheet** — type a new name any time before locking in.
- Next to the class dropdown is a **Ready checkbox**: checking it shows a lock-in warning, then marks the player READY and freezes their name, class and points (uncheck to edit again before the game starts). When every player is ready the log announces the game can begin — and in network games the **first move is blocked until all players are ready**, so the checkbox doubles as the start gate.
- Click the red **× Remove** at the bottom of any sheet to remove that character before the first move; fallen characters can be removed at any time.
- The **– Remove Active** button removes the currently active character; the last member cannot be removed.

## Multiplayer

1. Start the server on one computer.
2. One player clicks **Network → Host Game**. Check **Host as GM** to host without controlling a party member (spectator/DM mode).
3. Other players open the same page, enter the host ID, and click **Join**.
4. Each joining player is automatically assigned a party member to control.
5. The host is authoritative: client actions are sent to the host, confirmed or rolled back, and synced back.
6. Reconnecting clients are reassigned to their previous party member when possible.
7. Use the **Party Chat** panel to send messages; chat is relayed to all connected peers.
8. The optional **Turn timer** auto-ends a turn when time runs out.
9. **Pre-game lobby** lets players mark Ready/Not Ready before the host starts the game. Reconnecting clients see the current lobby state, and chat history is replayed to them.

## In-game guide

The pause menu (Esc) has a **📖 Game Guide (README)** button that opens a full in-game manual: quick start, controls, map key, class roles, the complete combat system with the damage formula, bestiary, items and status effects, dice roller, death rules, leveling, multiplayer and saving. A **🖨 Print** button inside the guide prints just the guide (game hidden, print-friendly black-on-white formatting) through the browser's standard print dialog.

## Save data

Save slots are stored in `localStorage` under `ascii-dungeon-crawler.slots.v1`. The pause menu lets you pick a slot name, then **Save**, **Load**, or **Delete**. Loading a slot asks for confirmation before replacing the current game. A legacy single snapshot is still kept under `ascii-dungeon-crawler.snapshot.v2` for backward compatibility. Save files are automatically migrated from older versions when loaded.

## Technical features

- **Host-authoritative actions**: remote actions are confirmed by the host; invalid actions are rolled back to prevent desync.
- **Automatic reconnection**: clients try to reconnect to the host and restore their assigned party member.
- **Runtime error boundary**: uncaught errors show a reset screen instead of freezing the game.
- **Save migration**: older snapshots are migrated forward when loaded.
- **Unit tests**: `npm test` runs Node.js tests for combat math and save migration.

## UI features

- **Turn-order timeline bar** shows living party members in turn order and highlights the active character.
- **Class avatars/portraits** appear on character sheets and the turn-order bar.
- **Floating combat text** appears over the map when characters or monsters take damage; ranged attackers also show a "RANGED!" flash.
- **Animated monster turns** activate one monster at a time with short delays instead of all at once.
- **Reachable-tile highlights** show where the active character can move on their turn.
- **HP bars** on each character sheet display current health as a colored bar.
- **Map tooltips** describe monsters, treasure, traps, doors, and terrain when you hover over a tile.
- **Minimap overview** in the side panel shows explored areas and party positions.
- **Mobile controls** float as a bottom overlay on narrow screens, with larger 64×64 pixel touch targets for the D-pad and action buttons.
- **Pause menu** has a Mute toggle and a volume slider; settings persist in `localStorage`.
- **Sound effects** for movement, attacks, hits, and treasure pickup are generated by Web Audio and respect the mute/volume settings.

## Class abilities & dice

Every class has three abilities, used with the buttons under Player Options or the **1 / 2 / 3** keys:

| Class   | Attack (1)    | Spell (2)                          | Power (3)                 |
|---------|---------------|------------------------------------|---------------------------|
| Fighter | Sword Strike 1d8 | Battle Cry — self-bless + AoE thunder | Cleave 2d8 — hits all adjacent |
| Archer  | Bow Shot 1d8 (range 5) | Pinning Shot — slows target 3 turns | Arrow Volley 2d8 — up to 3 enemies |
| Rogue   | Dagger Slash 1d6 | Poison Vial — ranged, poisons 3 turns | Backstab 3d6 — can crit for +50% |
| Wizard  | Arcane Bolt 1d10 | Fireball 2d6 — splash half to adjacent | Lightning Storm 3d10 — strongest enemy |
| Cleric  | Mace Blow 1d6 | Healing Word 2d4 — heals most wounded ally | Divine Smite 2d8 radiant |

- **Damage scales**: every roll adds the class stat modifier (Str/Dex/Int/Wis), +1 per 2 character levels, and +2 per Power Item found.
- **Spells cost charges** (shown under the buttons); charges grow with level and casting stat, and are restored by Resting or descending.
- **Power attacks have cooldowns** (3–4 turns).
- Every ability roll is written to the Adventure Log with its dice, bonuses and total, and echoed in the Dice Roller panel.

### Dice roller

An interactive dice panel sits under Player Options: choose count, die type (d4–d%), and modifier, then **Roll** (or **Adv**/**Dis** for advantage d20s). Rolls are cryptographically random, logged to the Adventure Log, broadcast to multiplayer chat, and natural 20s/1s are highlighted. Ability rolls made by the game appear in the same panel, so all randomness is visible in one place.

## Combat & gameplay features

- **Inventory system** with usable items: Healing Potion, Scroll of Blessing, Potion of Haste, Antidote, and Iron Key. Pick them up from the floor and use them from the side panel.
- **Status effects**: Poison, Stun, Bless, Haste, and Slow. They modify attack, movement, and action availability.
- **Monster AI variants**: Ranged attackers, fleeing cowards, pack hunters, patrollers, and brutes.
- **Boss floors** every 5 dungeon levels with larger, tougher boss monsters.
- **Revised death mechanics**: On Hard/Nightmare, death is permanent. On Easy/Normal, downed members have a chance to make a death saving throw; shrines revive one fallen ally.
- **Party formations** (Cluster, Line, Wedge, Spread) chosen before the first move.
- **Difficulty presets** (Easy, Normal, Hard, Nightmare) control enemy density, trap density, XP rate, monster stats, and permadeath.

## Project structure

```
.
├── crawler.html          # Main game page
├── server.js             # Static file server + WebSocket signaling
├── package.json
└── modules/
    ├── main.js           # Initialization and UI wiring
    ├── state.js          # Game state, save/load, snapshots
    ├── party.js          # Party members, stats, leveling
    ├── map.js            # Maze generation, floors, fog of war, biomes
    ├── pathfinding.js    # Reachability and distance helpers
    ├── combat.js         # Combat, traps, treasure
    ├── actions.js        # Player turn actions
    ├── ui.js             # Rendering, turn order, minimap, floating text
    ├── layout.js         # Draggable panels
    ├── input.js          # Keyboard/button/touch input
    ├── network.js        # WebRTC host/client
    ├── network-actions.js# Remote turn handling
    ├── log.js            # Adventure log
    ├── config.js         # Constants
    └── utils.js          # Helpers
└── tests/                 # Unit tests
    ├── combat.test.js
    └── state.test.js
```


