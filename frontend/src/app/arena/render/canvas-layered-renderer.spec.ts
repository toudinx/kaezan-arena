import { ArenaScene } from "../engine/arena-engine.types";
import { ArenaEngine } from "../engine/arena-engine";
import { CanvasLayeredRenderer } from "./canvas-layered-renderer";

describe("CanvasLayeredRenderer effective target marker", () => {
  it("uses effectiveTargetEntityId as an entity id and hides marker when entity is missing", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();

    (renderer as any).drawLockedTargetMarker(scene, viewport);
    expect(context.arcCallCount).toBeGreaterThan(0);

    context.reset();
    scene.effectiveTargetEntityId = "dragon";
    (renderer as any).drawLockedTargetMarker(scene, viewport);
    expect(context.arcCallCount).toBe(0);

    context.reset();
    scene.effectiveTargetEntityId = "mob.missing";
    (renderer as any).drawLockedTargetMarker(scene, viewport);
    expect(context.arcCallCount).toBe(0);

    context.reset();
    scene.effectiveTargetEntityId = null;
    (renderer as any).drawLockedTargetMarker(scene, viewport);
    expect(context.arcCallCount).toBe(0);
  });
});

describe("CanvasLayeredRenderer readability markers", () => {
  it("draws elite buff-link hints when a buffed mob is hovered and marks last threat", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();
    scene.hoveredMobEntityId = "mob.99";
    scene.threatMobEntityId = "mob.99";

    (renderer as any).drawMobReadabilityMarkers(scene, viewport);
    expect(context.setLineDashCallCount).toBeGreaterThan(0);

    context.reset();
    (renderer as any).drawThreatTargetMarker(scene, viewport);
    expect(context.arcCallCount).toBeGreaterThan(0);
  });

  it("renders interactable POI highlight arc without F key hint", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();
    scene.activePois = [
      {
        poiId: "poi.chest.1",
        type: "chest",
        pos: { x: 3, y: 4 },
        remainingMs: 30_000
      }
    ];

    (renderer as any).drawPoiMarkers(scene, viewport);
    expect(context.arcCallCount).toBeGreaterThan(0);
    expect(context.fillTextValues).not.toContain("F");
  });

  it("renders an ELITE hp badge for elite mobs", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();

    (renderer as any).drawMobHpBars(scene, viewport);
    expect(context.fillTextValues).toContain("ELITE");
  });
});

describe("CanvasLayeredRenderer floating number palette", () => {
  it("resolves Tibia-style colors by damage context and element", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const resolveColor = (entry: unknown) => (renderer as any).resolveDamageNumberFillColor(entry);

    expect(resolveColor(createDamageEntry({ element: 6 }))).toBe("#ffffff");
    expect(resolveColor(createDamageEntry({ element: 1 }))).toBe("#ff9f2d");
    expect(resolveColor(createDamageEntry({ isDamageReceived: true, element: 1 }))).toBe("#ef4444");
    expect(resolveColor(createDamageEntry({ isHeal: true, kind: "heal" }))).toBe("#39ff14");
    expect(resolveColor(createDamageEntry({ isShieldChange: true, shieldChangeDirection: "gain" }))).toBe("#93c5fd");
    expect(resolveColor(createDamageEntry({ isShieldChange: true, shieldChangeDirection: "loss" }))).toBe("#3b82f6");
  });

  it("increases crit size deterministically by ~25%", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const base = (renderer as any).computeDamageNumberEntryFontSizePx(16, createDamageEntry({ isCrit: false }), 0.5);
    const crit = (renderer as any).computeDamageNumberEntryFontSizePx(16, createDamageEntry({ isCrit: true }), 0.5);

    expect(crit).toBeGreaterThan(base);
    expect(crit).toBeGreaterThanOrEqual(Math.floor(base * 1.2));
  });
});

describe("CanvasLayeredRenderer crit text", () => {
  it("draws CRIT! floating text when crit_text instances are active", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();
    scene.floatingTexts = [
      {
        kind: "crit_text",
        text: "CRIT!",
        tilePos: { x: 4, y: 3 },
        startAtMs: 250,
        elapsedMs: 200,
        durationMs: 800
      }
    ];

    (renderer as any).drawFloatingTexts(scene, viewport);
    expect(context.fillTextCallCount).toBeGreaterThan(0);
    expect(context.fillTextValues).toContain("CRIT!");
  });

  it("does not draw CRIT! text after duration has elapsed", () => {
    const engine = new ArenaEngine();
    const initial = engine.applyBattleStep(
      engine.createTestScene(7, 7, 48),
      [],
      [],
      [],
      [{ type: "crit_text", text: "CRIT!", tileX: 3, tileY: 3, startAtMs: 250, durationMs: 800 }]
    );
    const expiredScene = engine.update(initial.scene, 801);
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };

    (renderer as any).drawFloatingTexts(expiredScene, viewport);
    expect(context.fillTextCallCount).toBe(0);
  });

  it("draws combat callout text variants for shield/assist moments", () => {
    const context = createContextStub();
    const renderer = new CanvasLayeredRenderer(context.context as unknown as CanvasRenderingContext2D);
    const viewport = {
      canvasWidth: 480,
      canvasHeight: 420,
      originX: 0,
      originY: 0
    };
    const scene = createScene();
    scene.floatingTexts = [
      {
        kind: "combat_callout",
        tone: "shield_break",
        text: "SHATTER",
        tilePos: { x: 3, y: 3 },
        startAtMs: 0,
        elapsedMs: 120,
        durationMs: 560,
        fontScale: 1
      },
      {
        kind: "combat_callout",
        tone: "assist",
        text: "VOID RICOCHET",
        tilePos: { x: 3, y: 3 },
        startAtMs: 0,
        elapsedMs: 80,
        durationMs: 520,
        fontScale: 1
      }
    ];

    (renderer as any).drawFloatingTexts(scene, viewport);
    expect(context.fillTextValues).toContain("SHATTER");
    expect(context.fillTextValues).toContain("VOID RICOCHET");
  });
});

function createContextStub(): ContextStub {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 420;

  const stub: ContextStub = {
    arcCallCount: 0,
    setLineDashCallCount: 0,
    lineToCallCount: 0,
    fillTextCallCount: 0,
    fillTextValues: [],
    context: {
      canvas,
      getTransform: () => new DOMMatrix(),
      clearRect: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => {
        stub.lineToCallCount += 1;
      },
      closePath: () => undefined,
      arc: () => {
        stub.arcCallCount += 1;
      },
      stroke: () => undefined,
      fill: () => undefined,
      setLineDash: () => {
        stub.setLineDashCallCount += 1;
      },
      fillRect: () => undefined,
      strokeRect: () => undefined,
      drawImage: () => undefined,
      strokeText: () => undefined,
      fillText: (value: unknown) => {
        stub.fillTextCallCount += 1;
        stub.fillTextValues.push(typeof value === "string" ? value : String(value));
      }
    },
    reset: () => {
      stub.arcCallCount = 0;
      stub.setLineDashCallCount = 0;
      stub.lineToCallCount = 0;
      stub.fillTextCallCount = 0;
      stub.fillTextValues = [];
    }
  };

  return stub;
}

function createScene(): ArenaScene {
  return {
    columns: 7,
    rows: 7,
    tileSize: 48,
    playerTile: { x: 3, y: 3 },
    effectiveTargetEntityId: "mob.42",
    lockedTargetEntityId: "mob.42",
    groundTargetPos: null,
    actorsById: {
      player_demo: {
        actorId: "player_demo",
        kind: "player",
        tileX: 3,
        tileY: 3,
        hp: 120,
        maxHp: 120
      },
      "mob.42": {
        actorId: "mob.42",
        kind: "mob",
        mobType: 4,
        isElite: true,
        tileX: 4,
        tileY: 3,
        hp: 10,
        maxHp: 10
      },
      "mob.99": {
        actorId: "mob.99",
        kind: "mob",
        mobType: 4,
        isBuffedByElite: true,
        buffSourceEliteId: "mob.42",
        tileX: 5,
        tileY: 3,
        hp: 10,
        maxHp: 10
      }
    },
    actorVisualsById: {},
    skillsById: {},
    tiles: [],
    sprites: [],
    decals: [],
    activeBuffs: [],
    activePois: [],
    fxInstances: [],
    attackFxInstances: [],
    projectileInstances: [],
    queuedDamageNumbers: [],
    nextDamageSpawnOrder: 0,
    damageNumbers: [],
    floatingTexts: []
  };
}

interface ContextStub {
  arcCallCount: number;
  setLineDashCallCount: number;
  lineToCallCount: number;
  fillTextCallCount: number;
  fillTextValues: string[];
  context: {
    canvas: HTMLCanvasElement;
    getTransform: () => DOMMatrix;
    clearRect: (...args: unknown[]) => void;
    save: (...args: unknown[]) => void;
    restore: (...args: unknown[]) => void;
    beginPath: (...args: unknown[]) => void;
    moveTo: (...args: unknown[]) => void;
    lineTo: (...args: unknown[]) => void;
    closePath: (...args: unknown[]) => void;
    arc: (...args: unknown[]) => void;
    stroke: (...args: unknown[]) => void;
    fill: (...args: unknown[]) => void;
    setLineDash: (...args: unknown[]) => void;
    fillRect: (...args: unknown[]) => void;
    strokeRect: (...args: unknown[]) => void;
    drawImage: (...args: unknown[]) => void;
    strokeText: (...args: unknown[]) => void;
    fillText: (...args: unknown[]) => void;
    [key: string]: unknown;
  };
  reset: () => void;
}

function createDamageEntry(overrides: Partial<ArenaScene["damageNumbers"][number]>): ArenaScene["damageNumbers"][number] {
  return {
    actorId: "mob.42",
    amount: 3,
    isCrit: false,
    kind: "damage",
    isHeal: false,
    isShieldChange: false,
    isDamageReceived: false,
    sourceEntityId: "player_demo",
    targetEntityId: "mob.42",
    element: 6,
    tilePos: { x: 4, y: 3 },
    stackIndex: 0,
    spawnOrder: 0,
    elapsedMs: 0,
    durationMs: 900,
    ...overrides
  };
}
