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

Skills são o principal sistema de build.

Exemplos:

Auto Attack
Exori
Exori Min
Exori Mas
Avalanche
Skill Leveling

Level ups permitem evoluir skills.

Exemplo:

Level 2 → upgrade
Level 3 → upgrade
Level 4 → upgrade
Level 5 → upgrade
Skill Paths

Cada skill possui caminhos.

Exemplo Exori:

Damage path
Cooldown path
AoE path

Isso cria builds diferentes.

10. Chest System

Baús aparecem durante a run.

Ao abrir um baú:

run pausa
player escolhe 1 de 3 cartas
Card System

Cartas modificam a run.

Exemplos:

Blood Feast
+life leech

Chain Explosion
mobs explodem

Overpopulation
+spawn rate
+XP

Cartas devem evitar false choices.

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

18. Movement System

Movimento funciona com:

tecla segurada
comando enviado todo tick

Resultados possíveis:

Accepted
Blocked

Razões:

occupied
corner block
cooldown
out of bounds
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
InMemoryBattleStore
ArenaConfig
Frontend
Angular
snapshot renderer
input → commands

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

arena combat
enemy spawn
elite system
skill leveling
card chests
inventory
characters page
bestiary
replay system
movement fixes
tick config
run telemetry

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