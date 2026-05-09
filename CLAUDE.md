# CLAUDE.md — Kaezan Arena

Instructions for AI assistants working on this repo. Read before doing anything else.

---

## First Steps (Every Session)

1. Read `README.md` — it is the only living documentation. Trust it over any other `.md` file.
2. Read `docs/ROADMAP.md` — understand what phase is active and what is in scope.
3. Do not read all files speculatively. Read only what is relevant to the task.

---

## After Every Implementation

- Update `README.md` to reflect what changed.
- Do not update other `.md` files unless explicitly asked.

---

## Non-Negotiable Invariants

Break any of these and the task is wrong regardless of how clean the code looks:

- **Backend is authoritative.** Frontend never simulates combat or makes gameplay decisions.
- **Determinism.** Same seed + commands + timing = identical run. No real-world time in gameplay logic. No unstable collection iteration.
- **7×7 grid.** Do not expand the arena. 9×7 is planned but must not be implemented until explicitly requested.
- **Player is fixed at tile (3,3).** No movement system.
- **All constants in `ArenaConfig.cs`.** Never hardcode a simulation value anywhere else.
- **All weapons fire via Assist System.** No manual casting.
- **Healing removed from kit.** Survivability comes from passive cards only.

---

## Code Standards

- Follow `.editorconfig` at repo root.
- Backend layering: `Domain ← Application ← Infrastructure ← Api`. Do not violate.
- Frontend arena boundaries: `engine`, `render`, `assets`, `ui`. Keep strict.
- All entity display names go in `ArenaConfig.DisplayNames`. Nowhere else.
- All weapon/character/species IDs go in `ArenaConfig.WeaponIds / CharacterIds / SpeciesIds`.
- Skills are currently switch-case dispatched. Adding a skill requires editing the switch — do not create parallel dispatch mechanisms.
- Do not add new hardcoded strings for IDs or names inside components or controllers.

---

## Workflow Rules

- **One feature per session.** Do not bundle multiple unrelated changes.
- **Small safe changes over large refactors.** If a refactor touches more than 3 files, flag it and ask before proceeding.
- **When repeated patching fails, remove and reimplement from scratch.** Do not keep layering fixes on broken logic.
- **If you see `// TODO` or a stub (e.g. 99999ms cooldown, `return true` in LOS), do not silently fix it unless the task explicitly covers it.** Flag it instead.
- **Do not rename constants, IDs, or event types without explicit instruction.** Renames break replay determinism and account persistence.

---

## Token Efficiency

- Read only files relevant to the task. Do not scan the entire codebase unless doing an explicit audit.
- Do not explain your reasoning process unless asked. Output the result.
- Do not repeat back the task description before starting.
- Do not add unsolicited comments to code you did not change.
- Prefer editing existing files over creating new ones.
- If a task is ambiguous, ask one specific question before proceeding — do not attempt and then apologize.


