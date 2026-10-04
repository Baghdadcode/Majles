# Stronghold TD: Game Brief

## The original
Stronghold is a Warcraft III custom map family (Stronghold 3 Teams by KubriK, Stronghold Remastered, Stronghold Wars), later remade as a Dota 2 custom game called Stronghold TD. It is a competitive tower defense where players attack each other.
- Each player has a lane, a builder, a Barracks and a Stronghold (HQ). You lose when your Stronghold falls.
- You build towers along your lane to kill the troops your opponents send at you. Every kill pays a bounty.
- Sending troops costs gold but permanently raises your income, which pays out every 10 seconds. Attacking is how your economy grows.
- Upgrading the Stronghold also raises income and unlocks stronger towers and troops.
- Fewer, upgraded towers beat lots of cheap ones. Matches last 10–20 minutes.

## Our game
A standalone remake built in Unity 6 (URP, Netcode for GameObjects), with an HD stylized Warcraft look.

**Modes and maps**
- 1v1 on Serpent Road, a winding mirrored lane map.
- 1v1v1 on Rift of Three, where three lanes meet at a central rift. One troop purchase sends a copy at each enemy, and players are eliminated until one Stronghold is left.
- LAN host/join lobby with map choice, plus AI opponents (Easy, Normal and Hard; personalities Balanced, Rusher, Economist and Turtle).

**Economy** (copied from the original's numbers)
- You start with 100 gold and 100 income per 10 s.
- There are 15 troops, and each costs double the last (20 → 5,120, then up to 100,000). Each troop adds 10% of its price to your income, and its bounty is 50%.
- There are 15 Stronghold levels. Each upgrade costs double the last (400 → 200,000) and raises income up to Lv.10.
- The Barracks trains one troop per second, with a queue of 7. Troops that reach the Stronghold stay and attack it until they are killed.

**Towers**
- 12 lines with 3 levels each, in one upgrade chain: Arrow, Fire Arrow, Water, Frost, Magic, Lightning, Solar, Cannon, Lava, Lunar, Magma, Holy. Level 3 of one line upgrades into level 2 of the next.
- Each line has its own effect: splash, burn, slow, chain lightning, ignoring armor, multishot, % of max HP, or a damage aura.
- Special Towers (bought once from the Stronghold): Mortar/Boulder (stun), Poison/Bramble (poison + slow) and Ice/Glacier (frost).
- Late-game aura towers: Regeneration, Endurance and Devotion.

**Troops** have traits that force counter-picks. Some examples are Knight armor, Paladin healing, fireproof and slow-immune footmen, burn immunity, and Gandalf's immunities.

**Presentation**
- Strategy camera with Q/E rotation, plus fog of war.
- WC3-style command-card shop.
- Procedural walk animations.
- Synthesised sound and music.
- Locked 60 fps with 75 troops and 48 towers.

## Where it stands (Oct 2026)
The core game is playable against the AI on both maps. Simulated AI matches run about 7 minutes, which is shorter than the original.

Next up:
1. Playtest AI v2.
2. Build an end-of-match stats screen.
3. Make unique Stronghold models per level.
4. Run a real multi-PC LAN test.
5. Add a how-to-play screen and a Windows build.

After that: lobby game modes (Fast income, Boss, Wave…), 2v2 teams, online play and more maps.
