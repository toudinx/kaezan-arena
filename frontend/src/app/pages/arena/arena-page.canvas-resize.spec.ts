import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent canvas resize", () => {
  function createComponent(): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  function makeCanvasMock(): HTMLCanvasElement {
    return {
      width: 300,
      height: 150,
      style: { width: "", height: "" }
    } as unknown as HTMLCanvasElement;
  }

  function makeContextMock(canvas: HTMLCanvasElement) {
    return {
      canvas,
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D;
  }

  function makeViewport(width: number, height: number): HTMLDivElement {
    return {
      getBoundingClientRect: () => ({ width, height, top: 0, left: 0, bottom: height, right: width })
    } as unknown as HTMLDivElement;
  }

  function makeScene(columns = 7, rows = 7) {
    return { columns, rows, tileSize: 0 };
  }

  it("fills canvas to match viewport bounds on first sync", () => {
    const component = createComponent();
    const canvas = makeCanvasMock();
    const context = makeContextMock(canvas);

    (component as any).canvasRef = { nativeElement: canvas };
    (component as any).canvasViewportRef = { nativeElement: makeViewport(686, 720) };
    (component as any).scene = makeScene();
    (component as any).canvasContext = context;

    (component as any).syncCanvasSize();

    expect(canvas.width).toBe(686);
    expect(canvas.height).toBe(720);
    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.height).toBe("100%");
    expect((component as any).canvasReady).toBe(true);
    expect((component as any).scene.tileSize).toBe(91); // safe-area constrained board fit
  });

  it("uses height as the tileSize constraint when viewport is wider than tall", () => {
    const component = createComponent();
    const canvas = makeCanvasMock();
    const context = makeContextMock(canvas);

    (component as any).canvasRef = { nativeElement: canvas };
    (component as any).canvasViewportRef = { nativeElement: makeViewport(686, 350) };
    (component as any).scene = makeScene();
    (component as any).canvasContext = context;

    (component as any).syncCanvasSize();

    // safe-area constrained tile size prefers height in this viewport
    expect((component as any).scene.tileSize).toBe(44);
    expect(canvas.width).toBe(686);
    expect((component as any).canvasReady).toBe(true);
  });

  it("re-syncs canvas correctly when viewport grows (window resize)", () => {
    const component = createComponent();
    const canvas = makeCanvasMock();
    const context = makeContextMock(canvas);
    const viewport = { getBoundingClientRect: () => ({ width: 686, height: 720 }) };

    (component as any).canvasRef = { nativeElement: canvas };
    (component as any).canvasViewportRef = { nativeElement: viewport };
    (component as any).scene = makeScene();
    (component as any).canvasContext = context;

    (component as any).syncCanvasSize();
    expect(canvas.width).toBe(686);
    expect((component as any).scene.tileSize).toBe(91);

    // Simulate window resize growing the viewport
    viewport.getBoundingClientRect = () => ({ width: 980, height: 720 });
    (component as any).syncCanvasSize();

    expect(canvas.width).toBe(980);
    // safe-area constrained tile size remains height-limited after resize
    expect((component as any).scene.tileSize).toBe(91);
    expect((component as any).canvasReady).toBe(true);
  });

  it("startCanvasResizeObserver observes the canvasViewport element", () => {
    const component = createComponent();
    const observeSpy = vi.fn();
    const mockObserver = { observe: observeSpy, disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", vi.fn(function() { return mockObserver; }));

    const mockViewport = {} as HTMLDivElement;
    (component as any).canvasViewportRef = { nativeElement: mockViewport };

    (component as any).startCanvasResizeObserver();

    expect(observeSpy).toHaveBeenCalledWith(mockViewport);

    vi.unstubAllGlobals();
  });
});
