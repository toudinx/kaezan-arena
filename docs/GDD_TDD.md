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
Mudança futura planejada: 9x7 (mais larga, mesma altura). Não implementar até ser explicitamente solicitado.

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

9. Weapon Kit System

Cada personagem tem um kit fixo de 3 armas + 1 slot livre por run.

Heal e Guard foram removidos do kit. Sobrevivência vem exclusivamente de cartas passivas (Vampiric Spikes, lifesteal, etc.).
Auto-attack melee single-target removido — substituído pelas armas do kit fixo.

Kits de personagem:

Kina:
  Fixos: Exori Min (frontal, 800ms) + Exori (AoE quadrado r=1, 1200ms) + Exori Mas (AoE diamond r=2, 2000ms)
  Livre: 1 arma de ataque escolhida por run via carta

Ranged Prototype:
  Fixos: Sigil Bolt (single-target ranged, 800ms) + Shotgun (cone AoE estilo dragon wave, 800ms) + Void Ricochet (ricochete com pierce por segmento, 2000ms)
  Livre: 1 arma de ataque escolhida por run via carta
  Status atual de produto: selecionavel na Characters page como "Prototype" (Ranged Kit [WIP]) para testes de ranged

Archer (futuro):
  Fixos: AA Ranged + Shotgun + Pierce Bolt
  Livre: 1 arma de ataque escolhida por run via carta

Mage (futuro):
  Fixos: AA Ranged + Pierce Bolt + Void Ricochet
  Livre: 1 arma de ataque escolhida por run via carta

Slot livre — regras:

Apenas armas de ataque/dano são permitidas — sem heal ou shield.
Exemplos: Avalanche (AoE no chão), Ranged projectile rune, Elemental rune.
É o principal vetor de customização por run.
Runes só podem ser equipadas no slot livre.

Todas as armas disparam automaticamente via Assist System — sem casting manual.

Ordem de prioridade do Assist (apenas ofensivo):

Ordem potency-first baseada no kit fixo da classe ativa -> [FreeSlotWeaponId se definido]
  - Kina: Exori Mas -> Exori -> Exori Min
  - Ranged Prototype: Void Ricochet -> Shotgun -> Sigil Bolt

Máx 1 auto-cast por tick.

Estado atual: slot livre começa null a cada run. Avalanche não está mais na prioridade fixa
do Assist — retorna automaticamente quando o sistema de runes definir
StoredBattle.FreeSlotWeaponId = ArenaConfig.WeaponIds.Avalanche.

Armas ranged:

Sigil Bolt - implementada (single target ranged auto-attack)
Shotgun - implementada (cone AoE estilo dragon wave; todos os mobs no cone tomam dano; knockback de 1 tile na direcao primaria quando destino livre)
Void Ricochet - implementada (reflexao em bordas, pierce em todos os mobs por segmento, 1 evento de projetil por segmento)
Pierce Bolt - futuro

Obstáculos destrutíveis: planejados após implementação de ranged.

9b. Rune System

Cada personagem desbloqueia uma rune especial (arma evoluída) ao ser obtido.

Runes de personagem:

Velvet / Kina: Exori Mas Rune (AoE melee evoluído)
Archer: Shotgun + Pierce combinados
Mage: Pierce + Void Ricochet combinados

Regras das runes:

A rune de um personagem pode ser equipada no slot livre de outro personagem.
Pré-requisitos: o jogador deve ter as armas base do personagem-alvo desbloqueadas
  (ex: rune da Velvet requer AA Ranged + Shotgun + Pierce desbloqueados)
O slot livre é o único slot onde runes podem ser equipadas.

Valor de design:

Colecionar personagens tem valor de gameplay real — além do cosmético.
Lore: absorver o Sigilo de outro Kaeli concede acesso ao poder deles.

Card System — Level-up

Cartas em level-up oferecem:

Passive cards (modificadores de run)
Skill upgrade cards: adiadas — não implementando agora
Weapon card para slot livre: escolha única por run

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
kit fixo de armas (3 slots fixos + 1 slot livre por run)
rune própria (desbloqueada ao obter o personagem)

Equipment

Slots principais:

Weapon
Armor
Relic

Equipamentos persistem entre runs.

Cada personagem tem uma identidade distinta definida pelo kit fixo e pela rune.
Coletar personagens novos expande as opções de rune disponíveis para todos os personagens.

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
Ranged foundation compartilhada (infraestrutura):
RangedProjectileFiredEventDto (evento polimorfico `ranged_projectile_fired`)
HasLineOfSight (stubado por enquanto, ativa com obstaculos destrutiveis)
ResolveRangedTarget (lock target primeiro, fallback nearest mob, filtro de range/LOS)
ApplyRangedDamageToMob (reusa pipeline existente RollDamageForAttacker + ApplyDamageToMob)
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

arena combat (player fixo em centro, armas automáticas via Assist)
enemy spawn + pacing progressivo
elite commander system
kit de armas fixo por personagem (3 slots fixos + 1 slot livre / rune slot)
slot livre (FreeSlotWeaponId) começa null a cada run — rune system a implementar
Avalanche não está mais no Assist fixo — aguarda o rune system
Heal e Guard removidos do kit — sobrevivência via passivos
card system: passive cards (chests + level-up); skill upgrade cards adiadas
passive card caps (máx 4 distintos, máx 3 stacks cada)
assist system (armas fixas disparam automaticamente; slot livre incluído quando preenchido)
POI interaction: left-click (chests, altar)
right-click target lock
ArenaConfig com todos os constants (clean config system)
ranged foundation compartilhada pronta (evento de projetil, evento de knockback, LOS stub, target helper, damage helper)
ProjectileAnimator visual no frontend (projetil puramente visual; sem simulacao de gameplay no cliente)
animacao visual de knockback no frontend (slide curto por evento; sem simulacao de gameplay no cliente)
LOS preparado para obstaculos destrutiveis futuros (stub ativo hoje)
Sigil Bolt, Shotgun e Void Ricochet ativas para classes de kit ranged; Kina permanece sem Sigil Bolt/Shotgun/Void Ricochet
Ranged Prototype selecionavel na Characters page (personagem provisoria de teste)
HTTP batch step (MAX_TICK_DEBT = 0 atualmente)
inventory + characters page + bestiary page
replay system
run telemetry completo (kills, damageDealt, damageTaken, minHpObserved, xpGained)
Tibia-style UI layout com skills e passivos no painel direito

A base técnica está pronta para expansão.

26. Future Systems

Planejados:

armas ranged restantes (AA Ranged, Pierce Bolt) sobre a fundacao compartilhada ja implementada
grid 9x7 (expansão planejada após ranged)
obstáculos destrutíveis (após ranged implementado)
rune system (cada personagem tem rune equipável no slot livre de outros)
skill upgrade cards (adiadas para após estabilização do kit fixo)
charms
meta progression
crafting
novos personagens (Archer, Mage)
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
