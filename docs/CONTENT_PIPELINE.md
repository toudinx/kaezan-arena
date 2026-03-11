This document defines how new gameplay content should be created in Kaezan: Arena.

The goal is to ensure that:

new content is easy to add

systems remain deterministic

balancing remains manageable

the project scales without architectural chaos

This document covers:

Enemies
Skills
Skill upgrades
Cards
Characters
Arena events
Future systems
Content Philosophy

Content in Kaezan Arena should follow three principles.

1. Simple Systems, Deep Combinations

Each element should be simple individually but combine into complex gameplay.

Example:

skill upgrade + card modifier + positioning

creates emergent gameplay.

2. Mechanics over Numbers

Content should prefer mechanical changes rather than pure stat increases.

Bad design:

+10% damage
+20% damage

Good design:

double hit
freeze enemies
chain explosion

Players remember mechanics, not numbers.

3. Horizontal Expansion

New content should expand options, not just increase power.

Example:

Bad expansion:

stronger sword
even stronger sword

Good expansion:

bleed sword
lifesteal sword
AoE sword
Creating New Enemies

Enemies are defined by:

speciesId
stats
attack behavior
special traits
Enemy Data Structure

Example:

{
  "speciesId": "skeleton",
  "name": "Skeleton",
  "hp": 80,
  "damage": 10,
  "attackType": "melee",
  "attackCooldownMs": 1200,
  "movementSpeed": 1
}
Enemy Archetypes

Enemies should follow archetypes.

Melee
walk toward player
short range attack

Example:

Skeleton
Zombie
Beast
Ranged
maintain distance
shoot projectiles

Example:

Archer
Mage
Hunter
Swarm
low HP
spawn in groups

Example:

Rat
Spider
Slime
Tank
high HP
slow movement

Example:

Golem
Guardian
Creating Elites

Elite enemies are normal enemies with modifiers.

Example:

Elite Skeleton
+50% HP
+30% damage
buffs nearby mobs

Elite behavior should remain predictable.

Creating New Skills

Skills define the core combat identity of a character.

A skill must define:

name
cooldown
area
effect
Example Skill Definition
{
  "skillId": "exori",
  "name": "Exori",
  "cooldownMs": 2000,
  "range": 1,
  "areaPattern": "frontArc",
  "effect": "physicalDamage"
}
Skill Design Rules

Skills should differ in:

area
timing
effect

Examples:

single target
AoE
cone
line
circle
Skill Upgrade System

Skills evolve through run levels.

Each skill should have multiple upgrade paths.

Example:

Exori:

Path A — damage
Path B — cooldown
Path C — AoE
Example Upgrade
{
  "upgradeId": "exori_double_hit",
  "skillId": "exori",
  "effect": "hitTwice"
}
Designing Skill Paths

Each skill should support different playstyles.

Example:

Avalanche:

Path A → damage
Path B → slow enemies
Path C → freeze chance
Creating Cards

Cards modify the run.

Cards are obtained from chests.

Cards should modify:

combat rules
enemy behavior
player mechanics
Card Definition

Example:

{
  "cardId": "chain_explosion",
  "name": "Chain Explosion",
  "effect": "enemyDeathExplosion"
}
Card Categories

Cards should fall into categories.

Damage

Example:

critical strikes
chain lightning
Survival

Example:

life leech
shield regen
Chaos

Example:

enemy explosions
spawn rate increase
Utility

Example:

XP gain
movement speed
Avoiding False Choices

Cards must avoid situations where one option is always better.

Bad design:

+10% damage
+20% damage
+30% damage

Good design:

+damage
+survival
+risk modifier
Creating Characters

Characters define:

base stats
skill kit
starting equipment

Example:

Character: Kina
Skills:
Exori
Exori Min
Exori Mas
Avalanche

Characters differ through skill kits.

Character Design Goals

Each character should have a theme.

Example:

Warrior
Mage
Hunter
Necromancer
Arena Events

Arena events create variety.

Examples:

chests
elite waves
environment hazards
Chest Event

Chest spawn pauses the simulation.

Player chooses:

1 of 3 cards
Future Systems

Future systems must integrate with the pipeline.

Planned:

charms
species crafting
meta progression
Adding New Content Workflow

When adding new gameplay content follow this order:

1 create design concept
2 implement data structure
3 add engine behavior
4 expose in snapshot
5 render in frontend
6 test replay determinism
Balancing Workflow

Balance should rely on run telemetry.

Example metrics:

run duration
damage dealt
damage taken
kill counts
cards chosen

These metrics guide balance decisions.

Testing New Content

Every new system should pass:

determinism tests
invariant checks
replay validation

No content should break simulation determinism.

Long-Term Content Scaling

To scale the game safely:

add enemies via data
add skills via definitions
add cards via data

Avoid hardcoding behavior.

Content should be data-driven whenever possible.

Final Rule

When creating new content ask:

Does this create a new gameplay decision?

If the answer is no, the content likely should not be added.