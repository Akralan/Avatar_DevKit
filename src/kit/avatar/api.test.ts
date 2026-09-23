import { vi } from "vitest";
import { BackendError, getBodyStatus, graft, startBody } from "./api";

const photo = (nom: string) => new File([nom], nom, { type: "image/jpeg" });

function repondreAvec(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob(["glb"]),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

test("startBody renvoie le task_id du backend", async () => {
  repondreAvec({ task_id: "abc123" });

  await expect(startBody([photo("face.jpg")], {})).resolves.toBe("abc123");
});

test("toutes les photos partent sous le même champ que le backend relit", async () => {
  // Le backend fait `request.files.getlist("image")` : Meshy fabrique le corps
  // à partir de plusieurs angles, une seule photo dégraderait tous les avatars.
  const fetchMock = repondreAvec({ task_id: "x" });

  await startBody([photo("face.jpg"), photo("dos.jpg"), photo("profil.jpg")], {});

  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.getAll("image")).toHaveLength(3);
});

test("les options de génération partent sous les noms que le backend lit", async () => {
  const fetchMock = repondreAvec({ task_id: "x" });

  await startBody([photo("face.jpg")], { texture: true, aPose: false, localBody: true });

  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get("texture")).toBe("1");
  expect(body.get("apose")).toBe("0");
  expect(body.get("local_body")).toBe("1");
});

test("les défauts de génération sont ceux du backend", async () => {
  const fetchMock = repondreAvec({ task_id: "x" });

  await startBody([photo("face.jpg")], {});

  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get("texture")).toBe("0");
  expect(body.get("apose")).toBe("1");
});

test("getBodyStatus encode le task_id dans l'URL", async () => {
  const fetchMock = repondreAvec({ status: "IN_PROGRESS", progress: 38 });

  await expect(getBodyStatus("a b/c")).resolves.toEqual({
    status: "IN_PROGRESS",
    progress: 38,
  });
  expect(fetchMock.mock.calls[0][0]).toContain("task_id=a%20b%2Fc");
});

test("graft envoie le masque facial et le task_id", async () => {
  const fetchMock = repondreAvec({});

  await graft("abc", new Blob(["face"]), { localFace: true });

  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get("task_id")).toBe("abc");
  expect(body.get("local_face")).toBe("1");
  expect((body.get("face") as File).name).toBe("face.glb");
});

test("une erreur du backend remonte SON message, pas un message générique", async () => {
  // C'est lui qui sait pourquoi : « Aucune image fournie », « Format non
  // supporté », « Maximum 4 images ».
  repondreAvec({ error: "Maximum 4 images." }, false, 400);

  await expect(graft("abc", new Blob(), {})).rejects.toThrow("Maximum 4 images.");
});

test("une erreur sans corps JSON exploitable reste lisible", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("pas du JSON");
    },
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(graft("abc", new Blob(), {})).rejects.toThrow(BackendError);
  await expect(graft("abc", new Blob(), {})).rejects.toThrow(/502/);
});
