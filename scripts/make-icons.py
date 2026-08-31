#!/usr/bin/env python3
"""Genera los iconos de Championísimo (PWA + apple-touch) con Pillow.

    python3 scripts/make-icons.py

Dibuja a 4x y reduce, que es la forma barata de tener antialiasing decente.
Diseño propio: copa de orejas genérica bajo una corona de estrellas, sobre
degradado azul; nada de marcas UEFA.
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BASE = 1024          # lienzo de diseño
SS = 4               # supersampling
S = BASE * SS

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def u(v):
    return int(round(v * SS))


def load_font(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def corner_gradient(tl, tr, bl, br):
    """Degradado de 4 esquinas: 2x2 px reescalado con bicúbica."""
    small = Image.new("RGB", (2, 2))
    small.putpixel((0, 0), tl)
    small.putpixel((1, 0), tr)
    small.putpixel((0, 1), bl)
    small.putpixel((1, 1), br)
    return small.resize((S, S), Image.BICUBIC)


def vertical_gradient(stops):
    """stops: lista de (pos 0-1, color). Devuelve una imagen S x S."""
    grad = Image.new("RGB", (1, S))
    px = grad.load()
    for y in range(S):
        t = y / (S - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                k = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                px[0, y] = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        else:
            px[0, y] = stops[-1][1]
    return grad.resize((S, S), Image.NEAREST)


def diagonal_sheen():
    """Bandas diagonales suaves, guiño al icono de Mundialísimo."""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    band = u(150)
    for i in range(-S, 2 * S, band * 2):
        d.polygon(
            [(i, 0), (i + band, 0), (i + band - S, S), (i - S, S)],
            fill=(255, 255, 255, 10),
        )
    return layer


def star_polygon(cx, cy, r_out, r_in, rotation=-90):
    """Estrella de cinco puntas centrada en (cx, cy), en unidades de diseño."""
    pts = []
    for i in range(10):
        ang = math.radians(rotation + i * 36)
        r = r_out if i % 2 == 0 else r_in
        pts.append((u(cx + r * math.cos(ang)), u(cy + r * math.sin(ang))))
    return pts


def star_crown():
    """Arco de estrellas sobre la copa, de extremo a extremo."""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy, radius = 512, 486, 404
    for i in range(7):
        ang = math.radians(197 + i * (146 / 6))
        x = cx + radius * math.cos(ang)
        y = cy + radius * math.sin(ang)
        # Las de los extremos, algo menores: dan sensación de arco.
        scale = 1.0 - 0.22 * abs(i - 3) / 3
        d.polygon(star_polygon(x, y, 50 * scale, 21 * scale), fill=(238, 244, 255, 242))
    return layer


def trophy_mask():
    """Máscara blanca con la silueta de la copa."""
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)

    cx = 512
    # Asas: dos arcos gruesos que salen de la copa hacia fuera y arriba.
    ear_w = u(34)
    d.arc([u(cx - 268), u(268), u(cx - 40), u(600)], 88, 272, fill=255, width=ear_w)
    d.arc([u(cx + 40), u(268), u(cx + 268), u(600)], 268, 92, fill=255, width=ear_w)

    # Cuenco: media elipse inferior + labio superior.
    d.pieslice([u(cx - 158), u(272), u(cx + 158), u(600)], 0, 180, fill=255)
    d.rectangle([u(cx - 158), u(300), u(cx + 158), u(440)], fill=255)
    d.ellipse([u(cx - 158), u(268), u(cx + 158), u(336)], fill=255)

    # Pie y base.
    d.polygon(
        [(u(cx - 44), u(560)), (u(cx + 44), u(560)), (u(cx + 34), u(690)), (u(cx - 34), u(690))],
        fill=255,
    )
    d.polygon(
        [(u(cx - 40), u(686)), (u(cx + 40), u(686)), (u(cx + 118), u(760)), (u(cx - 118), u(760))],
        fill=255,
    )
    d.rounded_rectangle([u(cx - 150), u(752), u(cx + 150), u(806)], radius=u(16), fill=255)
    return m


def background():
    img = corner_gradient((10, 18, 48), (22, 37, 94), (16, 26, 69), (36, 52, 126)).convert("RGBA")
    img.alpha_composite(diagonal_sheen())

    # Halo tras la copa.
    glow = Image.radial_gradient("L").resize((S, S), Image.BICUBIC)
    glow = glow.point(lambda v: max(0, 90 - v * 0.42))
    halo = Image.new("RGBA", (S, S), (140, 180, 255, 255))
    halo.putalpha(glow)
    img.alpha_composite(halo)
    return img


def foreground():
    """Estrellas, copa y año sobre transparente, para poder escalarlo."""
    layer = star_crown()

    silver = vertical_gradient([
        (0.00, (248, 250, 255)),
        (0.30, (198, 210, 232)),
        (0.55, (132, 146, 176)),
        (0.75, (214, 224, 242)),
        (1.00, (150, 163, 192)),
    ]).convert("RGBA")
    layer.paste(silver, (0, 0), trophy_mask())

    d = ImageDraw.Draw(layer)
    font = load_font(u(132))
    text = "26-27"
    box = d.textbbox((0, 0), text, font=font)
    d.text(
        ((S - (box[2] - box[0])) / 2 - box[0], u(838)),
        text,
        font=font,
        fill=(247, 200, 92, 255),
    )
    return layer


def build(scale=1.0, rounded=True):
    """scale < 1 deja margen: lo que necesitan los iconos maskable de Android."""
    img = background()

    art = foreground()
    if scale != 1.0:
        side = int(S * scale)
        art = art.resize((side, side), Image.LANCZOS)
        pad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        pad.alpha_composite(art, ((S - side) // 2, (S - side) // 2))
        art = pad
    img.alpha_composite(art)

    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=u(230), fill=255)
        img.putalpha(mask)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # (fichero, tamaño, escala del dibujo, esquinas redondeadas)
    variants = [
        ("icon-512x512.png", 512, 1.0, True),
        ("icon-192x192.png", 192, 1.0, True),
        # Maskable: Android recorta hasta un círculo, así que todo dentro del 80%.
        ("icon-maskable-512x512.png", 512, 0.72, False),
        ("icon-maskable-192x192.png", 192, 0.72, False),
        # iOS aplica su propia máscara: sin transparencia ni esquinas propias.
        ("apple-touch-icon.png", 180, 0.9, False),
    ]
    for name, size, scale, rounded in variants:
        icon = build(scale=scale, rounded=rounded).resize((size, size), Image.LANCZOS)
        if not rounded:
            icon = icon.convert("RGB")
        icon.save(OUT / name)
        print(f"  ✓ {name} ({size}px)")


if __name__ == "__main__":
    main()
