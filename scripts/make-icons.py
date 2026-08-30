#!/usr/bin/env python3
"""Genera los iconos de Championísimo (PWA + apple-touch) con Pillow.

    python3 scripts/make-icons.py

Dibuja a 4x y reduce, que es la forma barata de tener antialiasing decente.
Diseño propio: copa de orejas genérica sobre degradado azul; nada de marcas UEFA.
"""

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


def build():
    img = corner_gradient((10, 18, 48), (22, 37, 94), (16, 26, 69), (36, 52, 126)).convert("RGBA")
    img.alpha_composite(diagonal_sheen())

    # Halo tras la copa.
    glow = Image.radial_gradient("L").resize((S, S), Image.BICUBIC)
    glow = glow.point(lambda v: max(0, 90 - v * 0.42))
    halo = Image.new("RGBA", (S, S), (140, 180, 255, 255))
    halo.putalpha(glow)
    img.alpha_composite(halo)

    # Copa: degradado plateado recortado con la silueta.
    silver = vertical_gradient([
        (0.00, (248, 250, 255)),
        (0.30, (198, 210, 232)),
        (0.55, (132, 146, 176)),
        (0.75, (214, 224, 242)),
        (1.00, (150, 163, 192)),
    ]).convert("RGBA")
    img.paste(silver, (0, 0), trophy_mask())

    # Texto inferior.
    d = ImageDraw.Draw(img)
    font = load_font(u(132))
    text = "26-27"
    box = d.textbbox((0, 0), text, font=font)
    d.text(
        ((S - (box[2] - box[0])) / 2 - box[0], u(838)),
        text,
        font=font,
        fill=(247, 200, 92, 255),
    )

    # Esquinas redondeadas.
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=u(230), fill=255)
    img.putalpha(mask)
    return img


def main():
    icon = build()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in [
        ("icon-512x512.png", 512),
        ("icon-192x192.png", 192),
        ("apple-touch-icon.png", 180),
    ]:
        icon.resize((size, size), Image.LANCZOS).save(OUT / name)
        print(f"  ✓ {name} ({size}px)")


if __name__ == "__main__":
    main()
