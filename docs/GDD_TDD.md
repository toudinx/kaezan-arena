Kaezan: Arena
Game Design Document + Technical Design
1. Vision

Kaezan: Arena é um jogo de combate em arena inspirado em Tibia, mas adaptado para sessões rápidas.

O objetivo é criar:

“Tibia para adultos sem tempo.”

Isso significa:

combate tático baseado em posicionamento

runs curtas (~3 minutos)

progressão contínua

builds variadas

zero grind excessivo

O jogo combina elementos de:

Tibia — combate em grid e posicionamento

Hades — builds durante runs

League of Legends — progressão de skills

Vampire Survivors — caos crescente na arena

2. Core Gameplay Loop

O loop principal do jogo é:

Login
↓
Escolher personagem
↓
Entrar na arena
↓
Run (~3 minutos)
↓
Ganhar recompensas
↓
Melhorar personagem
↓
Nova run

Durante a run o jogador experimenta:

posicionamento
build de skills
eventos (baús)
combate caótico
3. Core Gameplay Principles
3.1 Short Runs

Runs duram cerca de:

3 minutos

Isso permite sessões rápidas.

3.2 Tactical Positioning

O combate depende de:

posicionamento
priorização de inimigos
controle de área

Não exige reflexos rápidos.

3.3 Progressive Chaos

A arena começa calma e termina caótica.

Curva típica:

Early: poucos mobs
Mid: pressão crescente
Late: caos total
4. Arena System

Arena grid:

7x7 tiles

Regras:

1 entidade por tile
movimento em 8 direções
distância Chebyshev
corner blocking estilo Tibia
5. Combat System
Damage Order
Shield
↓
HP

Regras:

damage remove shield
resto remove HP
HP <= 0 → morte
Actor Types

Existem três tipos principais:

Player
Mob
Elite

Cada ator possui:

position
hp
shield
cooldowns
status
6. Enemy System

Inimigos spawnam continuamente.

Curva de spawn típica:

0–30s → 1–2 mobs
30–90s → 3–5 mobs
90–150s → 6–8 mobs
150–180s → 8–10 mobs

Isso cria o caos progressivo.

7. Elite System

Alguns mobs spawnam como Elites.

Elites aplicam buffs.

Regras:

Elite buffa até 3 mobs
sem stacking
preferência para mesma espécie
buff removido ao morrer
8. Run Progression

Cada run possui:

Run XP
Run Levels

Run Level reseta a cada run.

9. Skill System

Skills são o principal sistema de build — estilo Vampire Survivors.

Personagem começa com:

Exori Min (ataque frontal — sempre ativo)
Heal (cura — sempre ativo)
Guard (escudo — sempre ativo)

Skills adicionais são desbloqueadas via skill cards obtidas em level-ups:

Exori (AoE quadrado ao redor do personagem)
Exori Mas (AoE wide diamond)
Avalanche (zona de AoE no chão)

Todas as skills disparam automaticamente via Assist System — sem casting manual.

Skill Leveling

Cada level-up abre uma tela de escolha de carta.

Possíveis cartas em level-up:

Skill cards (desbloqueiam novas skills — ex: Exori, Exori Mas, Avalanche)
Passive cards (modificadores de run — até 4 tipos distintos, máx 3 stacks cada)

Cada skill ganha cooldown reduzido automaticamente conforme evolui.

Passive Cards

Cartas passivas modificam o personagem durante a run.

Limites:

Máx 4 tipos distintos de passivos por run
Máx 3 stacks por passivo

Exemplos: Colossus Heart, Bloodletter Edge, Frenzy Clockwork, Arcane Tempo

10. Chest System

Baús aparecem durante a run.

Ao abrir um baú (left-click):

run pausa
player escolhe 1 de 3 passive cards

Chests oferecem apenas passive cards — não skill cards.

Skill cards são obtidas exclusivamente em level-ups.

Card System

Cartas passivas modificam a run globalmente.

Exemplos:

Bloodletter Edge — +22% damage, +2 HP on hit
Frenzy Clockwork — +35% attack speed, +8% damage
Arcane Tempo — +30% global cooldown reduction
Colossus Heart — +40% max HP, +6 damage

Cartas devem evitar false choices.

Limites por run:

Máx 4 tipos distintos de passivos
Máx 3 stacks por passivo
Máx 12 card selections totais por run

11. Character System

Personagens existem fora da run.

Possuem:

inventory
equipment
progression
Equipment

Slots principais:

Weapon
Armor
Relic

Equipamentos persistem entre runs.

12. Backpack System

Inventário é acessado via Backpack Drawer.

Ativação:

botão UI
tecla B

Mostra:

equipamentos
inventário
resumo de gear
13. Bestiary System

Bestiary rastreia kills.

Exemplo:

Skeleton
50 kills → rank 1
200 kills → rank 2
500 kills → rank 3

Recompensas:

crafting
materiais
charms futuros
14. Home Page

Hub principal do jogo.

Mostra:

personagem ativo
equipamentos
stats
currency

Botões principais:

Enter Arena
Characters
Bestiary
15. Currency

Moeda principal:

Echo Fragments

Uso:

crafting
progressão
meta upgrades
16. Deterministic Simulation

Simulação ocorre no backend.

Frontend não calcula combate.

Pipeline:

Start
↓
Step
↓
Commands
↓
State update
↓
Snapshot
↓
Render
17. Tick System

Tick padrão:

250ms

Configurável via:

Battle:StepDeltaMs

Frontend usa valor do backend.

18. Controls & Targeting

O player está fixo no tile central (3,3) — sem movimento WASD.

O combate é posicional via targeting e skills automáticas.

Controles ativos:

Left-click em POI → interagir (abrir baú, ativar altar)
Right-click em mob → lock target (o assist prioriza o target travado)

Teclas removidas:

WASD / setas — removidos (player fixo)
F key — removido (POI interaction agora é left-click)
19. Replay System

Replays permitem reproduzir runs.

Formato contém:

battleSeed
command timeline
config fingerprint

Funções:

export
import
replay

Replays não alteram economia.

20. Simulation Invariants

O sistema valida regras críticas:

grid bounds
1 entity per tile
hp >= 0
shield >= 0
hp <= maxHp

Executado em:

StartBattle
StepBattle
21. Run Telemetry

Runs geram logs estruturados.

Campos:

battleSeed
duration
kills
eliteKills
xp
runLevel
damage
minHP
cards
drops

Salvo em:

console
localStorage
export JSON
22. Technical Architecture
Backend
C#
.NET
stateless battle sessions
deterministic RNG

Componentes principais:

BattleV1Controller
InMemoryBattleStore (partials: MovementRules, PoiSystem, SkillLeveling, etc.)
ArenaConfig (todas as constantes — damage, timings, scaling curves, IDs)
Frontend
Angular
snapshot renderer
input → commands (left-click, right-click, card choice)

HTTP Polling:

POST /step por tick (MAX_TICK_DEBT = 0 atualmente → 1 request por 250ms)
Batch step implementado (até 16 steps por request, disponível para futuro uso)

Principais páginas:

Arena
Home
Characters
Bestiary
23. Project Structure

Exemplo simplificado:

backend/
  src/
    KaezanArena.Api/
      Battle/
      Controllers/
      Contracts/

frontend/
  src/
    app/
      pages/
        arena
        characters
        bestiary
        home
      shared/
        backpack
        replay
        run-results
24. Development Philosophy

O projeto segue:

incremental development
deterministic gameplay
safe refactors
no premature optimization

Sempre priorizando MVP jogável.

25. Current MVP Status

O MVP já possui:

arena combat (player fixo em centro, skills automáticas)
enemy spawn + pacing progressivo
elite commander system
Vampire Survivors–style skill progression (Exori Min inicial, unlock por cards)
card system: passive cards (chests), skill cards + passive cards (level-up)
passive card caps (máx 4 distintos, máx 3 stacks cada)
assist system (todas as skills disparam automaticamente)
POI interaction: left-click (chests, altar)
right-click target lock
ArenaConfig com todos os constants (clean config system)
HTTP batch step (MAX_TICK_DEBT = 0 atualmente)
inventory + characters page + bestiary page
replay system
run telemetry completo (kills, damageDealt, damageTaken, minHpObserved, xpGained)
Tibia-style UI layout com skills e passivos no painel direito

A base técnica está pronta para expansão.

26. Future Systems

Planejados:

charms
meta progression
crafting
novos personagens
novos mobs
novos eventos
27. Long-Term Vision

O objetivo final é um jogo que combine:

Tibia combat
+
Hades builds
+
LoL skill leveling
+
Vampire Survivors chaos

Tudo em runs curtas e altamente rejogáveis.