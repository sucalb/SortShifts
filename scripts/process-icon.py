"""Generate URANUS app icons (neo-brutalist calendar theme) for public/."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "public"

BG = "#fff7f0"
BLACK = "#101010"
ACCENT = "#553bee"
ACCENT_DARK = "#4029c9"
ACCENT_SOFT = "#ebe8ff"
TEAL = "#2a8179"
WHITE = "#ffffff"


def _rect(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], fill: str, outline: str | None = None, width: int = 0) -> None:
    if outline and width:
        draw.rectangle(box, fill=fill, outline=outline, width=width)
    else:
        draw.rectangle(box, fill=fill)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    s = size / 512

    def R(x: float, y: float, w: float, h: float) -> tuple[int, int, int, int]:
        return (int(x * s), int(y * s), int((x + w) * s), int((y + h) * s))

    stroke = max(1, round(14 * s))
    thin = max(1, round(8 * s))
    tab_stroke = max(1, round(10 * s))

    _rect(draw, R(108, 124, 296, 296), BLACK)
    _rect(draw, R(92, 108, 296, 296), ACCENT, BLACK, stroke)
    _rect(draw, R(92, 108, 296, 72), ACCENT_DARK, BLACK, stroke)
    _rect(draw, R(132, 76, 36, 52), ACCENT, BLACK, tab_stroke)
    _rect(draw, R(312, 76, 36, 52), ACCENT, BLACK, tab_stroke)

    if size >= 48:
        _rect(draw, R(124, 204, 88, 56), ACCENT_SOFT, BLACK, thin)
        _rect(draw, R(228, 204, 88, 56), ACCENT_SOFT, BLACK, thin)
        _rect(draw, R(332, 204, 48, 56), TEAL, BLACK, thin)
        _rect(draw, R(124, 276, 88, 56), ACCENT_SOFT, BLACK, thin)
        _rect(draw, R(228, 276, 88, 56), ACCENT_SOFT, BLACK, thin)
        _rect(draw, R(332, 276, 48, 56), ACCENT_SOFT, BLACK, thin)
        _rect(draw, R(124, 348, 256, 40), WHITE, BLACK, thin)

        bar = max(2, round(20 * s))
        ux0, uy0, ux1, uy1 = R(168, 362, 28, 18)[0], R(168, 362, 28, 18)[1], R(196, 380, 0, 0)[2], R(168, 380, 56, 30)[3]
        draw.rectangle((ux0, uy0, ux0 + bar, uy1 + int(18 * s)), fill=ACCENT)
        draw.rectangle((ux1 - bar, uy0, ux1, uy1 + int(18 * s)), fill=ACCENT)
        draw.rectangle((ux0, uy1 + int(10 * s), ux1, uy1 + int(18 * s)), fill=ACCENT)
    else:
        inner = R(140, 170, 200, 200)
        _rect(draw, inner, ACCENT_SOFT, BLACK, max(1, round(6 * s)))
        bar = max(2, round(size * 0.12))
        x0, y0, x1, y1 = inner
        cx = (x0 + x1) // 2
        cy = (y0 + y1) // 2 + int(size * 0.06)
        half = int(size * 0.16)
        top = cy - half
        bottom = cy + half
        draw.rectangle((cx - half, top, cx - half + bar, bottom), fill=WHITE)
        draw.rectangle((cx + half - bar, top, cx + half, bottom), fill=WHITE)
        draw.rectangle((cx - half, bottom - bar, cx + half, bottom), fill=WHITE)

    return img.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    sizes = {
        "favicon.png": 32,
        "favicon-32.png": 32,
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon.png": 256,
    }

    for name, px in sizes.items():
        draw_icon(px).save(OUT_DIR / name, optimize=True)

    print("Generated icons in", OUT_DIR)


if __name__ == "__main__":
    main()
