"""Build the face GLB the graft pipeline expects, straight from a photo.

This is the port of `buildFaceGLB`, which used to run in the browser: the demo page
detected the landmarks with MediaPipe in JavaScript, assembled the glTF by hand, and
posted the result to `/graft`. A mobile app cannot do that — MediaPipe has no
cross-platform Flutter binding, and the one Android-only option returns 468 points
where this topology needs 478 — so the construction moves here, where MediaPipe and
the model are already installed for the body side of the graft.

The output is a contract, not a format choice: 478 vertices in canonical MediaPipe
order, 898 triangles, one texture, UVs that place each vertex where it sits in the
photo. `texture_swap` matches vertices to the body **by index**, so any renumbering
would silently graft a face whose nose lands on a cheek.
"""
from __future__ import annotations

import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from .face_triangulation import FACE_TRIANGULATION

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task"

#: 468 face points + 10 iris points. The triangulation only spans the first 468;
#: the iris vertices carry no triangle but stay in the buffer to keep the indexing
#: canonical.
VERTEX_COUNT = 478

#: Longest side of the texture we ship, in pixels. A face needs no more for the
#: graft, and the backend rasteriser decodes the texture into raw numpy — a 4K
#: photo costs ~33 MB per copy and takes the container out of memory.
TEXTURE_MAX_SIDE = 1024

#: How far the silhouette's UVs are pulled inward (7 %). Without it the border
#: triangles sample whatever is *behind* the head, and the graft wears a halo of
#: background.
EDGE_ERODE = 0.07

TRIANGLES = np.asarray(FACE_TRIANGULATION, dtype=np.uint16)


class NoFaceDetected(RuntimeError):
    """No face in the photo — or too small, too dark, too far off-axis."""


def build_face_glb(photo: bytes) -> bytes:
    """Photo bytes in, `face.glb` bytes out."""
    image = _load(photo)
    landmarks, pose = _detect(np.asarray(image))
    positions = _positions(landmarks, image.width / image.height)
    _frontalize(positions, pose)
    uv = _uv(positions, image.width / image.height)
    return _assemble(positions, uv, _encode(image))


def _load(photo: bytes) -> Image.Image:
    """Decode, straighten, downscale.

    `exif_transpose` is not optional: phones record orientation in EXIF rather than
    rotating the pixels, so a portrait shot arrives on its side. The browser never
    hit this — its photo came from a canvas — and a sideways face is simply not
    detected, which would read as "no face in the photo".
    """
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(photo))).convert("RGB")
    longest = max(image.size)
    if longest > TEXTURE_MAX_SIDE:
        scale = TEXTURE_MAX_SIDE / longest
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.LANCZOS,
        )
    return image


def _detect(rgb: np.ndarray):
    """Return (478x3 normalised landmarks, 4x4 pose matrix or None)."""
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.2,
        min_face_presence_confidence=0.2,
        # The whole point of asking for it: without the head's pose there is no
        # frontalisation, and a face shot from three-quarters comes out squashed.
        output_facial_transformation_matrixes=True,
    )
    landmarker = vision.FaceLandmarker.create_from_options(options)
    result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not result.face_landmarks:
        raise NoFaceDetected("no face detected in the photo")

    points = result.face_landmarks[0]
    if len(points) < VERTEX_COUNT:
        raise NoFaceDetected(f"incomplete landmarks ({len(points)})")

    landmarks = np.array(
        [[p.x, p.y, p.z] for p in points[:VERTEX_COUNT]], dtype=np.float64
    )
    matrices = result.facial_transformation_matrixes
    return landmarks, np.asarray(matrices[0], dtype=np.float64) if matrices else None


def _positions(landmarks: np.ndarray, aspect: float) -> np.ndarray:
    """Normalised landmarks -> a Y-up, Z-forward point cloud in real proportions.

    X and Z are multiplied by the aspect ratio because MediaPipe normalises X by the
    width and Y by the height, and scales Z like X. Skipping it squeezes the face
    horizontally, which reads as a face stretched vertically.
    """
    positions = np.empty((VERTEX_COUNT, 3), dtype=np.float64)
    positions[:, 0] = (landmarks[:, 0] - 0.5) * aspect
    positions[:, 1] = -(landmarks[:, 1] - 0.5)
    positions[:, 2] = -landmarks[:, 2] * aspect
    return positions


def _frontalize(positions: np.ndarray, pose: np.ndarray | None) -> None:
    """Rotate the cloud back to face-on, in place.

    The pose matrix places the canonical face onto the detected head; applying the
    transpose of its rotation undoes it. Near-identity for someone already looking at
    the lens, so it costs nothing in the common case and saves the off-axis one.
    """
    if pose is None or pose.shape != (4, 4):
        return
    rotation = pose[:3, :3]
    # The columns carry MediaPipe's scale as well as its rotation; only the rotation
    # should be undone, or the face changes size on its way to being straightened.
    rotation = rotation / np.linalg.norm(rotation, axis=0, keepdims=True)
    centre = positions.mean(axis=0)
    positions[:] = (positions - centre) @ rotation + centre


def _uv(positions: np.ndarray, aspect: float) -> np.ndarray:
    """UVs = orthographic projection of the *frontalised* mesh onto the photo.

    Inverting how the positions were built means the UVs land back on the face in the
    photo — but regularised by the pose, so the silhouette is an ellipse instead of a
    perspective outline that spills onto an ear or the background.
    """
    uv = np.empty((VERTEX_COUNT, 2), dtype=np.float64)
    uv[:, 0] = np.clip(positions[:, 0] / aspect + 0.5, 0.0, 1.0)
    uv[:, 1] = np.clip(0.5 - positions[:, 1], 0.0, 1.0)

    boundary = _boundary_vertices()
    if EDGE_ERODE > 0 and boundary.size:
        centre = uv.mean(axis=0)
        uv[boundary] = centre + (uv[boundary] - centre) * (1 - EDGE_ERODE)
    return uv


def _boundary_vertices() -> np.ndarray:
    """Vertices on the open edge of the mesh — the silhouette.

    An edge shared by a single triangle is a border; its endpoints are what must be
    pulled inward. Derived from the triangulation so the two can never drift apart.
    """
    triangles = TRIANGLES.reshape(-1, 3).astype(np.int64)
    edges = np.concatenate(
        [triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]
    )
    edges.sort(axis=1)
    _, index, counts = np.unique(edges, axis=0, return_index=True, return_counts=True)
    return np.unique(edges[index[counts == 1]])


def _encode(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def _assemble(positions: np.ndarray, uv: np.ndarray, texture: bytes) -> bytes:
    """Hand-rolled GLB: three accessors and one embedded JPEG.

    Written by hand rather than through a library because the file has to match what
    ARCore emits, down to the unlit material and the vertex order — and because
    `trimesh` would rebuild the buffers its own way.
    """
    pos_bytes = positions.astype("<f4").tobytes()
    uv_bytes = uv.astype("<f4").tobytes()
    idx_bytes = TRIANGLES.astype("<u2").tobytes()

    align = lambda n: (n + 3) & ~3  # noqa: E731 — glTF wants 4-byte boundaries
    off_pos = 0
    off_uv = align(off_pos + len(pos_bytes))
    off_idx = align(off_uv + len(uv_bytes))
    off_img = align(off_idx + len(idx_bytes))
    bin_length = align(off_img + len(texture))

    blob = bytearray(bin_length)
    blob[off_pos : off_pos + len(pos_bytes)] = pos_bytes
    blob[off_uv : off_uv + len(uv_bytes)] = uv_bytes
    blob[off_idx : off_idx + len(idx_bytes)] = idx_bytes
    blob[off_img : off_img + len(texture)] = texture

    gltf = {
        "asset": {"version": "2.0", "generator": "MyTwin-face"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "TEXCOORD_0": 1},
                        "indices": 2,
                        "material": 0,
                        "mode": 4,
                    }
                ]
            }
        ],
        "materials": [
            {
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0,
                    "roughnessFactor": 1,
                },
                "extensions": {"KHR_materials_unlit": {}},
                "doubleSided": True,
            }
        ],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{}],
        "images": [{"bufferView": 3, "mimeType": "image/jpeg"}],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": VERTEX_COUNT,
                "type": "VEC3",
                "min": positions.min(axis=0).tolist(),
                "max": positions.max(axis=0).tolist(),
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": VERTEX_COUNT,
                "type": "VEC2",
            },
            {
                "bufferView": 2,
                "componentType": 5123,
                "count": int(TRIANGLES.size),
                "type": "SCALAR",
            },
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off_pos, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": off_uv, "byteLength": len(uv_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": off_idx, "byteLength": len(idx_bytes), "target": 34963},
            {"buffer": 0, "byteOffset": off_img, "byteLength": len(texture)},
        ],
        "buffers": [{"byteLength": bin_length}],
    }

    payload = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    payload += b" " * (align(len(payload)) - len(payload))

    total = 12 + 8 + len(payload) + 8 + bin_length
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)          # 'glTF', version, length
    out += struct.pack("<II", len(payload), 0x4E4F534A)       # JSON chunk
    out += payload
    out += struct.pack("<II", bin_length, 0x004E4942)         # BIN chunk
    out += blob
    return bytes(out)
