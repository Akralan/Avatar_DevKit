import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { RenderModule, RenderInstance, Subject } from "./types";
import type { RenderStageHandle } from "./stage";

// Le WebGLRenderer est remplacé : jsdom n'a pas de contexte WebGL, et ce qui
// se teste ici est le cycle de vie que tient le kit, pas le rendu de three.
const renderers: RendererStub[] = [];

class RendererStub {
  public setPixelRatio = vi.fn();
  public setSize = vi.fn();
  public render = vi.fn();
  public dispose = vi.fn();
  public forceContextLoss = vi.fn();

  public constructor() {
    renderers.push(this);
  }
}

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: RendererStub };
});

const { RenderStage } = await import("./stage");
const THREE = await import("three");

function fakeSubject(): Subject {
  return {
    id: "male_body",
    label: "male_body",
    group: new THREE.Group(),
    size: new THREE.Vector3(0.6, 1.8, 0.4),
  };
}

function fakeModule(overrides: Partial<RenderModule> = {}): RenderModule {
  return {
    id: "test",
    title: "Test",
    author: "",
    description: "",
    defaultConfig: {},
    controls: [],
    create: () => ({
      frame: vi.fn(),
      setConfig: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    }),
    ...overrides,
  } as RenderModule;
}

beforeEach(() => {
  renderers.length = 0;
  vi.unstubAllGlobals();
});

test("un module qui jette affiche l'erreur au lieu d'un canvas muet", () => {
  const module = fakeModule({
    create: () => {
      throw new Error("le shader ne compile pas");
    },
  });

  render(<RenderStage module={module} subject={fakeSubject()} config={{}} />);

  expect(screen.getByRole("alert")).toHaveTextContent("le shader ne compile pas");
});

test("un module qui jette ne laisse pas de contexte WebGL orphelin", () => {
  // Les navigateurs plafonnent le nombre de contextes simultanés : un atelier
  // qui plante quelques fois rendrait les suivants impossibles à ouvrir.
  render(
    <RenderStage
      module={fakeModule({
        create: () => {
          throw new Error("boum");
        },
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  expect(renderers.at(-1)?.forceContextLoss).toHaveBeenCalledOnce();
  expect(renderers.at(-1)?.dispose).toHaveBeenCalledOnce();
});

test("une perte de contexte est annoncée, pas subie en silence", () => {
  render(<RenderStage module={fakeModule()} subject={fakeSubject()} config={{}} />);

  // L'événement vient du navigateur, hors du cycle React : sans `act`, la
  // mise à jour d'état n'est pas vidée avant l'assertion.
  act(() => {
    document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost"));
  });

  expect(screen.getByRole("alert")).toHaveTextContent(/contexte WebGL/i);
});

test("le mouvement réduit est transmis au module dès la première frame", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const frame = vi.fn();

  render(
    <RenderStage
      module={fakeModule({
        create: () => ({ frame, setConfig: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  expect(frame).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: true }));
});

test("la config courante est poussée au module à la création", () => {
  const setConfig = vi.fn();

  render(
    <RenderStage
      module={fakeModule({
        create: () => ({ frame: vi.fn(), setConfig, resize: vi.fn(), dispose: vi.fn() }),
      })}
      subject={fakeSubject()}
      config={{ densite: 260 }}
    />,
  );

  expect(setConfig).toHaveBeenCalledWith({ densite: 260 });
});

test("démonter le stage dispose l'instance et le renderer", () => {
  const dispose = vi.fn();
  const { unmount } = render(
    <RenderStage
      module={fakeModule({
        create: () => ({ frame: vi.fn(), setConfig: vi.fn(), resize: vi.fn(), dispose }),
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  unmount();

  expect(dispose).toHaveBeenCalledOnce();
  expect(renderers.at(-1)?.dispose).toHaveBeenCalledOnce();
});

test("la boucle ne tourne pas tant que le canvas est hors du viewport", () => {
  // Contrainte de performance mobile : une page avec plusieurs canvases ne doit
  // pas faire tourner ceux qu'on ne voit pas.
  let notify: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      public constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        notify = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
    },
  );
  const frame = vi.fn();
  const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);

  render(
    <RenderStage
      module={fakeModule({
        create: () => ({ frame, setConfig: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  expect(raf).not.toHaveBeenCalled();
  notify?.([{ isIntersecting: true }]);
  expect(raf).toHaveBeenCalled();

  raf.mockRestore();
});

test("une action déclarée par le module atteint l'instance du rendu", () => {
  // Sans cette poignée, « Rejouer » serait affiché mais inatteignable :
  // l'instance vit dans le stage, le bouton dans le panneau.
  const replay = vi.fn();
  const instance = {
    frame: vi.fn(),
    setConfig: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    replay,
  } as unknown as RenderInstance<unknown>;

  const ref = createRef<RenderStageHandle>();
  render(
    <RenderStage
      ref={ref}
      module={fakeModule({
        create: () => instance,
        actions: [
          {
            id: "replay",
            label: "Rejouer",
            run: (target) => (target as unknown as { replay(): void }).replay(),
          },
        ],
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  ref.current?.runAction("replay");

  expect(replay).toHaveBeenCalledOnce();
});

test("une action inconnue est ignorée sans jeter", () => {
  const ref = createRef<RenderStageHandle>();
  render(
    <RenderStage ref={ref} module={fakeModule()} subject={fakeSubject()} config={{}} />,
  );

  expect(() => ref.current?.runAction("nexistepas")).not.toThrow();
});


test("prendre une vignette rend une image juste avant de lire le canvas", () => {
  // Le buffer de dessin WebGL est vidé dès que le navigateur compose : lire le
  // canvas plus tard rend une image vide. La capture doit donc rendre puis lire,
  // dans la même tâche.
  const frame = vi.fn();
  const ref = createRef<RenderStageHandle>();
  render(
    <RenderStage
      ref={ref}
      module={fakeModule({
        create: () => ({ frame, setConfig: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
      })}
      subject={fakeSubject()}
      config={{}}
    />,
  );

  const canvas = document.querySelector("canvas")!;
  canvas.toDataURL = vi.fn(() => "data:image/webp;base64,ZZZZ");
  const avant = frame.mock.calls.length;

  const vignette = ref.current?.snapshot();

  expect(frame.mock.calls.length).toBe(avant + 1);
  expect(vignette).toBe("data:image/webp;base64,ZZZZ");
  expect(vi.mocked(canvas.toDataURL).mock.invocationCallOrder[0]).toBeGreaterThan(
    frame.mock.invocationCallOrder.at(-1)!,
  );
});

test("changer de sujet prévient l'instance au lieu de tout reconstruire", () => {
  // Le contrat annonce `onSubjectChange` et les quatre modules l'implémentent :
  // s'il n'est jamais appelé, un contributeur qui s'y fie débogue dans le vide.
  const onSubjectChange = vi.fn();
  const dispose = vi.fn();
  const instance = {
    frame: vi.fn(),
    setConfig: vi.fn(),
    resize: vi.fn(),
    dispose,
    onSubjectChange,
  };
  const module = fakeModule({ create: () => instance });

  const { rerender } = render(
    <RenderStage module={module} subject={fakeSubject()} config={{}} />,
  );
  const autre = { ...fakeSubject(), id: "rubens", label: "Corps réel" };
  rerender(<RenderStage module={module} subject={autre} config={{}} />);

  expect(onSubjectChange).toHaveBeenCalledWith(autre);
  expect(dispose).not.toHaveBeenCalled();
});
