"""Build compact development-only review boards from Phase A.1 browser captures."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SCREENSHOTS = ROOT / "benchmark-results" / "map" / "core-v2-phase-a1" / "screenshots"
MAPS = [
    ("Crown Citadel", "crown-citadel"),
    ("Ironwatch", "ironwatch"),
    ("Holding Tower", "southwest-holding-tower"),
    ("Deed Camp", "west-south-deed-camp"),
    ("West Support", "west-support"),
]
ZOOMS = ["low", "normal", "close"]
FONT = ImageFont.load_default()


def load_capture(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as source:
        # Browser full-page captures include a blank strip below the fixed
        # 996x720 game surface; exclude it from the review board only.
        game_surface = source.convert("RGB").crop((0, 0, min(source.width, 996), min(source.height, 720)))
        game_surface.thumbnail(size, Image.Resampling.LANCZOS)
        result = Image.new("RGB", size, "#17130f")
        result.paste(game_surface, ((size[0] - game_surface.width) // 2, (size[1] - game_surface.height) // 2))
        return result


def label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int) -> None:
    draw.rectangle((x, y, x + 320, y + 19), fill="#18130f")
    draw.text((x + 6, y + 4), text, fill="#f2dfae", font=FONT)


def build_zoom_board() -> None:
    cell_width, image_height, label_height = 320, 231, 20
    gap, header = 8, 34
    width = len(ZOOMS) * cell_width + (len(ZOOMS) - 1) * gap
    height = header + len(MAPS) * (image_height + label_height) + (len(MAPS) - 1) * gap
    board = Image.new("RGB", (width, height), "#100d0a")
    draw = ImageDraw.Draw(board)
    draw.text((8, 10), "Core v2 Phase A.1 - actual renderer: low / normal / close", fill="#f2dfae", font=FONT)
    for row, (map_name, stem) in enumerate(MAPS):
        top = header + row * (image_height + label_height + gap)
        for column, zoom in enumerate(ZOOMS):
            left = column * (cell_width + gap)
            board.paste(load_capture(SCREENSHOTS / f"{stem}-{zoom}.png", (cell_width, image_height)), (left, top + label_height))
            label(draw, f"{map_name} - {zoom}", left, top)
    board.save(SCREENSHOTS / "runtime-zoom-review-board.png", optimize=True)


def build_tight_board() -> None:
    columns, cell_width, image_height, label_height = 2, 490, 354, 20
    gap, header = 10, 34
    rows = 3
    width = columns * cell_width + gap
    height = header + rows * (image_height + label_height) + (rows - 1) * gap
    board = Image.new("RGB", (width, height), "#100d0a")
    draw = ImageDraw.Draw(board)
    draw.text((8, 10), "Core v2 Phase A.1 - tightest city-pair interaction views", fill="#f2dfae", font=FONT)
    for index, (map_name, stem) in enumerate(MAPS):
        row, column = divmod(index, columns)
        left = column * (cell_width + gap)
        top = header + row * (image_height + label_height + gap)
        board.paste(load_capture(SCREENSHOTS / f"{stem}-tight-cluster.png", (cell_width, image_height)), (left, top + label_height))
        draw.rectangle((left, top, left + cell_width, top + label_height - 1), fill="#18130f")
        draw.text((left + 6, top + 4), map_name, fill="#f2dfae", font=FONT)
    board.save(SCREENSHOTS / "tight-cluster-review-board.png", optimize=True)


if __name__ == "__main__":
    build_zoom_board()
    build_tight_board()
    print("Core v2 Phase A.1 contact sheets: PASS")
