"""Remove white background and generate app icons from URANUS logo."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\hoang.bui\.cursor\projects\c-Users-hoang-bui-Downloads\assets"
    r"\c__Users_hoang.bui_AppData_Roaming_Cursor_User_workspaceStorage_119cde71cd3306a74fba3992cfc6a399_images_Screenshot_2026-05-29_191556-940df461-10e7-4b90-adf4-7231b10986b0.png"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "public"


def is_background_pixel(r: int, g: int, b: int, a: int, tolerance: int = 28) -> bool:
    if a < 10:
        return True
    return r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance


def remove_background(img: Image.Image, tolerance: int = 28) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    data = rgba.load()
    visited: set[tuple[int, int]] = set()
    stack: list[tuple[int, int]] = []

    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        visited.add((x, y))
        r, g, b, a = data[x, y]
        if not is_background_pixel(r, g, b, a, tolerance):
            continue
        data[x, y] = (r, g, b, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    return rgba


def trim_transparent(img: Image.Image, padding: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(img.width, bbox[2] + padding)
    bottom = min(img.height, bbox[3] + padding)
    return img.crop((left, top, right, bottom))


def fit_square(img: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scale = min(size / img.width, size / img.height) * 0.88
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset = ((size - new_w) // 2, (size - new_h) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def crop_symbol(img: Image.Image) -> Image.Image:
    """Use upper portion (U mark) for tiny favicon sizes."""
    w, h = img.size
    return img.crop((0, 0, w, int(h * 0.72)))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC)
    cleaned = trim_transparent(remove_background(source))
    cleaned.save(OUT_DIR / "uranus-logo.png", optimize=True)

    symbol = trim_transparent(crop_symbol(cleaned), padding=4)

    sizes = {
        "favicon-32.png": 32,
        "favicon.png": 32,
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon.png": 256,
    }
    for name, size in sizes.items():
        base = symbol if size <= 32 else cleaned
        fit_square(base, size).save(OUT_DIR / name, optimize=True)

    print("Generated icons in", OUT_DIR)


if __name__ == "__main__":
    main()
