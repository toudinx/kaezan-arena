This document defines the core design principles of Kaezan: Arena.

Its purpose is to protect the identity of the project as new systems, features, characters, enemies, and progression layers are added.

Whenever a new idea appears, it should be evaluated against these principles.

If a feature violates too many of them, it probably does not belong in Kaezan Arena.

1. Core Identity

Kaezan: Arena is:

Tibia for adults without time sinks.

This means the game should deliver:

the feeling of Tibia-style positional combat

short and satisfying play sessions

meaningful progression

memorable combat moments

low friction between sessions

It should not require:

long continuous sessions

repetitive grind to feel progress

high APM

constant micromanagement

2. Short Sessions Are Sacred

Runs must remain short.

Target:

~3 minutes

This is one of the strongest pillars of the game.

Every system should respect that.

Good:

progression that fits short runs

quick start / quick restart

high-impact choices

Bad:

systems that require 20–40 minute runs

long setup before gameplay starts

progression that only feels meaningful after many hours

3. Target Priority & Decision-Making Must Matter

The soul of Kaezan Arena is tactical decision-making within the arena.

The player is fixed at the center — there is no movement.

The player should win or lose primarily because of:

target priority (right-click lock on the right enemy)

timing of card choices

risk/reward decisions (go for the chest or not?)

build choices (which skills to unlock, which passives to stack)

Not because of:

spam clicking

pure reflex speed

UI complexity

menu management inside the run

A feature is usually good if it creates:

a new tactical decision inside the 7x7 arena (even without movement)

4. 7x7 Is a Feature, Not a Limitation

The 7x7 arena is core to the game identity.

It creates:

density

readability

pressure

tactical clarity

The design should prefer:

making the 7x7 more alive

adding tension inside the arena

changing pressure, pacing, and interactions

Instead of:

expanding into map wandering

diluting combat by giving too much space

turning the game into a dungeon crawler

The small arena is what makes the game feel sharp.

5. Calm → Pressure → Chaos

Every run should follow a readable emotional curve.

Target experience:

calm → pressure → chaos

The early run should be readable and controlled.
The mid run should introduce pressure.
The late run should feel intense and satisfying.

The game should avoid:

starting already at maximum chaos

flat pacing

all difficulty spikes happening randomly

unfair sudden overwhelm without readable buildup

A good run should feel like it escalates naturally.

6. Low APM, High Decision Quality

Kaezan Arena should reward:

good choices

good positioning

good build thinking

good risk assessment

It should not require:

fast clicking

repeated spam input

high mechanical precision

This is a game about:

skill expression through decisions
not

skill expression through hand speed

The ideal player feeling is:

“I could have survived if I had positioned better.”

Not:

“I lost because I didn’t press buttons fast enough.”

7. Mechanics Over Raw Numbers

Whenever possible, prefer mechanical design over pure numerical increases.

Bad:

+10% damage

+20% damage

+30% damage

Better:

enemies explode on death

Exori hits twice

Avalanche slows enemies

gain shield after elite kill

Players remember mechanics.
They do not remember small percentages.

Raw stats still have a place, but they should not dominate the content design.

8. Meaningful Choice Over Fake Choice

Choices must feel real.

A player choosing between options should think:

“Which of these is best for my current run?”

Not:

“Obviously this is the only correct one.”

This is especially important for:

chest card choices

skill upgrades

future charms

future gear decisions

Good choices involve:

trade-offs

risk/reward

style differences

short-term vs long-term gains

Bad choices are:

3 versions of the same stat

one clearly dominant option

options irrelevant to the current run state

9. Build Identity Matters

Runs should feel different from one another.

The player should be able to think things like:

“This became an Exori run.”

“This is a sustain build.”

“This run is all about freezing and controlling space.”

“This chest turned the whole run.”

Build variety is one of the main replay drivers.

That means:

skill upgrade paths must matter

cards must meaningfully alter the run

systems should combine into recognizable playstyles

10. Permanent Progression Must Respect Time

Kaezan Arena should include permanent progression, but it must be compact and respectful.

Good permanent progression:

bestiary progress

equipment

future charms

account resources

new build options

Bad permanent progression:

endless chores

systems that require huge repetition for tiny rewards

progression that invalidates short-session design

MMO-style time sink loops

Permanent progression should create:

“Even a short run moved me forward.”

11. Run Progression Must Be Exciting

Inside the run, the player must feel growth.

A good run should not feel static.

The player should regularly feel:

stronger

more specialized

more explosive

more capable of controlling chaos

Run progression should come from things like:

run levels

skill upgrades

chest cards

key events

A run that feels the same from second 1 to second 180 is failing.

12. Systems Must Have Clear Roles

Each progression system should have a clear purpose.

Confirmed separation:

Run Level → card choices: skill cards (unlock skills) + passive cards
Chests → passive cards only (no skill unlocks from chests)
Bestiary → permanent species progression
Equipment → persistent character strength and identity
Future charms → long-term specialization

If two systems do the same thing, one of them is probably redundant.

Avoid overlapping systems that confuse the player.

13. Determinism Is Not Optional

Determinism is a core technical principle, but it also affects design quality.

It enables:

reproducible balance testing

replay debugging

reliable behavior

confidence in system interactions

Design ideas should never casually break:

stable simulation

reproducible outcomes

authoritative backend logic

The frontend must not become a hidden gameplay layer.

14. Readability Beats Spectacle

The game can be chaotic, but it must remain readable.

Good chaos:

many threats, but understandable

pressure, but with player agency

explosive moments that still feel fair

Bad chaos:

random unavoidable deaths

too many overlapping unreadable effects

constant visual overload

pressure with no meaningful decision-making

A good test is:

Can the player understand why they died?

If not, readability probably failed.

15. Risk / Reward Should Drive Excitement

Great moments in Kaezan Arena should come from tension.

Examples:

going for a chest while under pressure

focusing the elite instead of escaping

staying in the fight at low HP

choosing a risky chest card for a high-power run

The game becomes more memorable when the player repeatedly asks:

“Do I take this risk?”

That is much more interesting than passive progression alone.

16. The Game Should Reward Return, Not Obligation

Players should come back because they want to, not because the game pressures them.

Good retention comes from:

short satisfying runs

visible progression

build experimentation

memorable chaos

“just one more run” energy

Bad retention comes from:

chores

timers that punish absence

systems that create anxiety

excessive daily-task design

The game should feel inviting, not demanding.

17. One Feature Should Solve One Problem

Before adding any feature, define the exact problem it solves.

Examples:

cards solve run variety

skill upgrades solve build identity

bestiary solves long-term return motivation

replay solves debugging and balance reproducibility

If a feature does not clearly solve a real problem, it probably should wait.

This protects the game from feature bloat.

18. Simplicity First, Depth Through Interaction

Kaezan Arena should avoid unnecessary complexity.

Depth should come from:

interaction between systems

positioning

pacing

build combinations

Not from:

giant menus

too many currencies

too many parallel progression systems

too many mandatory mechanics at once

The player should feel:

“Simple to understand, deep to master.”

19. Every New Idea Must Pass These Questions

Before implementing a new system, ask:

Does this preserve short sessions?

Does this strengthen the 7x7 arena fantasy?

Does this create a new meaningful choice?

Does this improve positioning, pacing, build identity, or progression?

Does this avoid fake complexity?

Does this keep combat readable?

Does this respect deterministic architecture?

If many answers are “no”, the idea probably does not belong in the game.

20. Final Principle

Kaezan Arena should always aim to create this feeling:

A short, intense, readable combat experience with meaningful progression and memorable builds.

If a feature helps that, it probably belongs.
If it weakens that, it probably should be rejected.