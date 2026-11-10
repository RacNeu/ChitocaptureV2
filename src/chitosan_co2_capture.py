"""Parametric, dashboard-scale chitosan CO2 capture demonstration system.

Coordinate convention: millimetres, X is the process-flow direction, Y is
width/depth, and +Z is vertical. Vessel origins are on the platform datum;
vertical vessels use Z axes and the CO2 receiver uses an X axis.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

from cadgen import build123d as bd
from cadgen import glb, srgb, step


# Primary envelope and platform (all dimensions in millimetres).
PLATFORM_LENGTH = 15_000.0
PLATFORM_WIDTH = 4_000.0
PLATFORM_THICKNESS = 250.0
BASE_Z = PLATFORM_THICKNESS

# Process equipment stations along X.
PRETREATMENT_X = -4_300.0
ADSORBER_X = -500.0
REGENERATION_X = 2_300.0
CO2_TANK_X = 4_800.0
STACK_X = 6_400.0
CENTER_Y = 0.0

# Equipment dimensions.
PRETREATMENT_RADIUS = 620.0
PRETREATMENT_HEIGHT = 2_650.0
ADSORBER_RADIUS = 1_100.0
ADSORBER_HEIGHT = 4_500.0
REGENERATION_RADIUS = 620.0
REGENERATION_HEIGHT = 2_450.0
CO2_TANK_RADIUS = 540.0
CO2_TANK_LENGTH = 2_400.0
STACK_RADIUS = 310.0
STACK_HEIGHT = 8_400.0

PIPE_RADIUS = 115.0
CO2_PIPE_RADIUS = 90.0


def _vertical_vessel(x: float, radius: float, height: float, label: str, color: str):
    body = bd.Pos(x, CENTER_Y, BASE_Z + height / 2) * bd.Cylinder(
        radius, height, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER)
    )
    body.label = label
    body.color = srgb(color)
    return body


def _pipe_segment(start: tuple[float, float, float], end: tuple[float, float, float], radius: float):
    """Make one straight pipe segment along X or Z, centered on its endpoints."""
    dx, dy, dz = (end[i] - start[i] for i in range(3))
    length = (dx * dx + dy * dy + dz * dz) ** 0.5
    if length <= 0:
        raise ValueError("pipe segment endpoints must differ")
    if abs(dy) > 1e-6 or (abs(dx) > 1e-6 and abs(dz) > 1e-6):
        raise ValueError("pipe routes use axis-aligned X/Z segments")
    rotation = (0, 90, 0) if abs(dx) > 1e-6 else (0, 0, 0)
    middle = tuple((start[i] + end[i]) / 2 for i in range(3))
    segment = bd.Pos(*middle) * bd.Cylinder(
        radius, length + 2 * radius, rotation=rotation,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    return segment


def _pipe_route(label: str, points: tuple[tuple[float, float, float], ...], radius: float, color: str):
    pieces = [_pipe_segment(a, b, radius) for a, b in zip(points, points[1:])]
    for i, piece in enumerate(pieces, start=1):
        piece.label = f"{label}_segment_{i}"
        piece.color = srgb(color)
    return bd.Compound(children=pieces, label=label)


def _heating_coil():
    """Four low-detail, separately selectable heating rings around regeneration."""
    rings = []
    coil_radius = REGENERATION_RADIUS + 95.0
    for i in range(4):
        z = BASE_Z + 520.0 + i * 430.0
        ring = bd.Pos(REGENERATION_X, CENTER_Y, z) * bd.Torus(
            coil_radius, 45.0,
            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
        )
        ring.label = f"heating_coil_ring_{i + 1}"
        ring.color = srgb("#F28C3C")
        rings.append(ring)
    return bd.Compound(children=rings, label="heating_coil")


def _name_glb_nodes():
    """Give exported meshes animation-friendly names and logical parents."""
    path = Path(__file__).resolve().parents[1] / "GLB" / "chitosan_co2_capture.glb"
    data = path.read_bytes()
    magic, version, byte_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or byte_length != len(data):
        raise ValueError("cadgen output is not a complete GLB v2 file")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("GLB does not begin with a JSON chunk")
    document = json.loads(data[20:20 + json_length].decode("utf-8").rstrip())
    nodes = document.get("nodes", [])
    materials = document.get("materials", [])

    # Give each mesh the stable, semantic name of its explicitly assigned CAD
    # material rather than relying on exporter node order.
    for node in nodes:
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        names = {
            materials[primitive["material"]].get("name")
            for primitive in document["meshes"][mesh_index].get("primitives", [])
            if "material" in primitive
        }
        names.discard(None)
        if len(names) != 1:
            raise ValueError(f"GLB node has ambiguous material names: {names}")
        node["name"] = next(iter(names))

    named: dict[str, list[int]] = {}
    for index, node in enumerate(nodes):
        if node.get("mesh") is not None:
            named.setdefault(str(node.get("name", "")), []).append(index)

    def group(name: str, children: tuple[str, ...]) -> int:
        missing = [child for child in children if child not in named]
        if missing:
            raise ValueError(f"GLB is missing {name} child component(s): {missing}")
        child_indices = [index for child in children for index in named[child]]
        index = len(nodes)
        nodes.append({"name": name, "children": child_indices})
        return index

    bed = group("adsorbent_bed", ("adsorbent_bed_media", "adsorbent_bed_strata"))
    adsorber = len(nodes)
    shell = named.get("adsorber_shell", [])
    if not shell:
        raise ValueError("GLB is missing the adsorber inspection shell")
    nodes.append({"name": "adsorber", "children": [*shell, bed]})
    regeneration = group("regeneration", ("regeneration_vessel", "heating_coil"))
    co2_pipe = group("co2_pipe", (
        "co2_pipe_adsorber_to_regeneration", "co2_pipe_regeneration_to_tank",
    ))
    main_gas = group("main_gas_pipe", ("flue_gas_inlet", "pretreat_to_adsorber_pipe"))
    main_pipes = len(nodes)
    nodes.append({"name": "main_pipes", "children": [main_gas]})

    direct_names = ("platform", "pretreatment", "co2_tank", "treated_gas_pipe", "stack")
    missing = [name for name in direct_names if name not in named]
    if missing:
        raise ValueError(f"GLB is missing named component(s): {missing}")
    roots = [
        *[index for name in direct_names for index in named[name]],
        adsorber, regeneration, co2_pipe, main_pipes,
    ]
    system_root = len(nodes)
    nodes.append({"name": "chitosan_co2_capture_system", "children": roots})
    document.setdefault("scenes", [{"nodes": []}])
    document["scenes"][0]["nodes"] = [system_root]
    document["scene"] = 0

    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    remainder = data[20 + json_length:]
    updated = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + len(remainder))
    updated += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + remainder
    path.write_bytes(updated)


@step(
    out="../STEP/chitosan_co2_capture.step",
    mesh_tolerance=2.0e-3,
    materials={
        "definitions": {
            "platform": {"name": "platform", "baseColor": "#536675", "roughness": 0.75},
            "flue_gas": {"name": "flue_gas_inlet", "baseColor": "#D66B42"},
            "pretreatment": {"name": "pretreatment", "baseColor": "#7D9AA8"},
            "pretreat_pipe": {"name": "pretreat_to_adsorber_pipe", "baseColor": "#D79B42"},
            "inspection_glass": {
                "name": "adsorber_shell",
                "baseColor": "#B9DDE5",
                "roughness": 0.3,
                "metalness": 0.05,
            },
            "bed": {"name": "adsorbent_bed_media", "baseColor": "#5DAB94"},
            "bed_strata": {"name": "adsorbent_bed_strata", "baseColor": "#317D70"},
            "regeneration": {"name": "regeneration_vessel", "baseColor": "#879BA6"},
            "coil": {"name": "heating_coil", "baseColor": "#F28C3C"},
            "co2_adsorber": {"name": "co2_pipe_adsorber_to_regeneration", "baseColor": "#36A6C7"},
            "co2_tank_pipe": {"name": "co2_pipe_regeneration_to_tank", "baseColor": "#36A6C7"},
            "co2_tank": {"name": "co2_tank", "baseColor": "#6D91A4"},
            "treated_gas": {"name": "treated_gas_pipe", "baseColor": "#55A979"},
            "stack": {"name": "stack", "baseColor": "#6B7780"},
        },
        "assignments": [
            {"targets": ["#platform"], "material": "platform"},
            {"targets": ["#flue_gas_inlet"], "material": "flue_gas"},
            {"targets": ["#pretreatment"], "material": "pretreatment"},
            {"targets": ["#pretreat_to_adsorber_pipe"], "material": "pretreat_pipe"},
            {"targets": ["#adsorber_shell"], "material": "inspection_glass"},
            {"targets": ["#adsorbent_media"], "material": "bed"},
            {"targets": ["#adsorbent_bed_stratum_1", "#adsorbent_bed_stratum_2", "#adsorbent_bed_stratum_3", "#adsorbent_bed_stratum_4", "#adsorbent_bed_stratum_5"], "material": "bed_strata"},
            {"targets": ["#regeneration_vessel"], "material": "regeneration"},
            {"targets": ["#heating_coil"], "material": "coil"},
            {"targets": ["#co2_pipe_adsorber_to_regeneration"], "material": "co2_adsorber"},
            {"targets": ["#co2_pipe_regeneration_to_tank"], "material": "co2_tank_pipe"},
            {"targets": ["#co2_tank"], "material": "co2_tank"},
            {"targets": ["#treated_gas_pipe"], "material": "treated_gas"},
            {"targets": ["#stack"], "material": "stack"},
        ],
    },
)
@glb(out="../GLB/chitosan_co2_capture.glb", mesh_tolerance=2.0e-3)
def chitosan_co2_capture():
    # Rectangular skid, centered on the origin. Datum top is BASE_Z.
    platform = bd.Box(
        PLATFORM_LENGTH, PLATFORM_WIDTH, PLATFORM_THICKNESS,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
    )
    platform.label = "platform"
    platform.color = srgb("#536675")

    # Left-side inlet to the pretreatment vessel.
    flue_gas_inlet = _pipe_route(
        "flue_gas_inlet",
        ((-7_500.0, CENTER_Y, BASE_Z + 1_420.0),
         (PRETREATMENT_X - PRETREATMENT_RADIUS, CENTER_Y, BASE_Z + 1_420.0)),
        PIPE_RADIUS, "#D66B42",
    )

    pretreatment = _vertical_vessel(
        PRETREATMENT_X, PRETREATMENT_RADIUS, PRETREATMENT_HEIGHT,
        "pretreatment", "#7D9AA8",
    )

    # Gas rises from pretreatment, crosses above the equipment, and enters the
    # adsorber at its left side. Overlapping segment ends make visible elbows.
    pretreat_to_adsorber = _pipe_route(
        "pretreat_to_adsorber_pipe",
        ((PRETREATMENT_X, CENTER_Y, BASE_Z + PRETREATMENT_HEIGHT),
         (PRETREATMENT_X, CENTER_Y, BASE_Z + 3_550.0),
         (ADSORBER_X - ADSORBER_RADIUS, CENTER_Y, BASE_Z + 3_550.0),
         (ADSORBER_X - ADSORBER_RADIUS, CENTER_Y, BASE_Z + 2_200.0)),
        PIPE_RADIUS, "#D79B42",
    )

    # Adsorber is intentionally shown as a lightly transparent inspection
    # shell; the bed and its simple horizontal strata remain separate objects.
    adsorber_shell = bd.Pos(ADSORBER_X, CENTER_Y, BASE_Z + ADSORBER_HEIGHT / 2) * bd.Cylinder(
        ADSORBER_RADIUS, ADSORBER_HEIGHT,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    adsorber_shell.label = "adsorber_shell"
    adsorber_shell.color = srgb("#B9DDE5", 0.24)

    bed_bottom = BASE_Z + 650.0
    bed_top = BASE_Z + ADSORBER_HEIGHT - 500.0
    bed = bd.Pos(ADSORBER_X, CENTER_Y, (bed_bottom + bed_top) / 2) * bd.Cylinder(
        ADSORBER_RADIUS * 0.72, bed_top - bed_bottom,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    bed.label = "adsorbent_media"
    bed.color = srgb("#5DAB94", 0.78)
    strata = []
    for i in range(5):
        disk = bd.Pos(ADSORBER_X, CENTER_Y, bed_bottom + 250.0 + i * 680.0) * bd.Cylinder(
            ADSORBER_RADIUS * 0.725, 34.0,
            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
        )
        disk.label = f"adsorbent_bed_stratum_{i + 1}"
        disk.color = srgb("#317D70")
        strata.append(disk)
    adsorbent_bed = bd.Compound(children=[bed, *strata], label="adsorbent_bed")
    adsorber = bd.Compound(children=[adsorber_shell, adsorbent_bed], label="adsorber")

    # Smaller regeneration vessel with a simple four-ring electric heater.
    regeneration_body = _vertical_vessel(
        REGENERATION_X, REGENERATION_RADIUS, REGENERATION_HEIGHT,
        "regeneration_vessel", "#879BA6",
    )
    regeneration = bd.Compound(
        children=[regeneration_body, _heating_coil()], label="regeneration"
    )

    # Secondary CO2 route from the adsorber's lower side into regeneration.
    co2_pipe_to_regen = _pipe_route(
        "co2_pipe_adsorber_to_regeneration",
        ((ADSORBER_X + ADSORBER_RADIUS, CENTER_Y, BASE_Z + 1_350.0),
         (REGENERATION_X - REGENERATION_RADIUS, CENTER_Y, BASE_Z + 1_350.0)),
        CO2_PIPE_RADIUS, "#36A6C7",
    )

    # Horizontal receiver tank on its X axis, next to the regeneration vessel.
    tank = bd.Pos(CO2_TANK_X, CENTER_Y, BASE_Z + CO2_TANK_RADIUS) * bd.Cylinder(
        CO2_TANK_RADIUS, CO2_TANK_LENGTH, rotation=(0, 90, 0),
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    tank.label = "co2_tank"
    tank.color = srgb("#6D91A4")

    # Regeneration gas rises, turns toward the receiver, then enters its left
    # head. This and the preceding route are independently named for animation.
    co2_pipe_to_tank = _pipe_route(
        "co2_pipe_regeneration_to_tank",
        ((REGENERATION_X + REGENERATION_RADIUS, CENTER_Y, BASE_Z + 1_350.0),
         (CO2_TANK_X - CO2_TANK_LENGTH / 2, CENTER_Y, BASE_Z + 1_350.0),
         (CO2_TANK_X - CO2_TANK_LENGTH / 2, CENTER_Y, BASE_Z + CO2_TANK_RADIUS),
         (CO2_TANK_X - CO2_TANK_LENGTH / 2 + 150.0, CENTER_Y, BASE_Z + CO2_TANK_RADIUS)),
        CO2_PIPE_RADIUS, "#36A6C7",
    )
    co2_pipe = bd.Compound(children=[co2_pipe_to_regen, co2_pipe_to_tank], label="co2_pipe")

    # Treated gas exits high on the adsorber and feeds the tall stack on the
    # right edge of the 15 m platform.
    treated_gas_pipe = _pipe_route(
        "treated_gas_pipe",
        ((ADSORBER_X, CENTER_Y, BASE_Z + ADSORBER_HEIGHT),
         (ADSORBER_X, CENTER_Y, BASE_Z + ADSORBER_HEIGHT + 500.0),
         (STACK_X - STACK_RADIUS, CENTER_Y, BASE_Z + ADSORBER_HEIGHT + 500.0)),
        PIPE_RADIUS, "#55A979",
    )
    stack = _vertical_vessel(
        STACK_X, STACK_RADIUS, STACK_HEIGHT, "stack", "#6B7780"
    )

    # Exact requested top-level parts and their process groupings.
    main_gas_pipe = bd.Compound(
        children=[flue_gas_inlet, pretreat_to_adsorber], label="main_gas_pipe"
    )
    main_pipes = bd.Compound(children=[main_gas_pipe], label="main_pipes")
    return bd.Compound(
        children=[
            platform,
            pretreatment,
            adsorber,
            regeneration,
            tank,
            co2_pipe,
            treated_gas_pipe,
            stack,
            main_pipes,
        ],
        label="chitosan_co2_capture_system",
    )


if __name__ == "__main__":
    chitosan_co2_capture()
    _name_glb_nodes()
