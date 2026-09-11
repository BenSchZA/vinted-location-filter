"""Render the Chrome Web Store promotional tiles.

The store requires exact PNG dimensions and an opaque 24-bit colour format.
This script builds both restrained brand tiles from the extension icon and
verifies the PNG IHDR fields directly so packaging errors fail immediately.
"""
import os
import pathlib
import struct
import subprocess
import tempfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
ICON = ROOT / 'extension' / 'icons' / 'icon128.png'
STORE = ROOT / 'docs' / 'store'

BACKGROUND = '#F6F6F4'
PRIMARY = '#171717'
SECONDARY = '#6B6B6B'

TITLE = 'Vinted Location Filter'
SUBTITLE = 'Filter search results by seller location'

FONT_REGULAR = 'PromoRobotoRegular'
FONT_MEDIUM = 'PromoRobotoMedium'
USER_FONTS = pathlib.Path.home() / 'Library' / 'Fonts'
ROBOTO_REGULAR = USER_FONTS / 'Roboto-Regular.ttf'
ROBOTO_MEDIUM = USER_FONTS / 'Roboto-Medium.ttf'

TILES = (
    ('promo-small-440x280.png', 440, 280, 64, 20, 23, 8, 13, None),
    ('promo-marquee-1400x560.png', 1400, 560, 96, 28, 54, 14, 24, 110),
)


def run_magick(arguments, environment):
    """Run ImageMagick and stop if it reports an error."""
    subprocess.run(['magick', *arguments], check=True, env=environment)


def configure_fonts(directory):
    """Create a temporary ImageMagick font map for installed Roboto faces."""
    for path in (ROBOTO_REGULAR, ROBOTO_MEDIUM):
        if not path.is_file():
            raise RuntimeError(f'Required installed font is missing: {path}')

    font_map = f'''<?xml version="1.0" encoding="UTF-8"?>
<typemap>
  <type format="ttf" name="{FONT_REGULAR}" fullname="Roboto Regular"
        family="Roboto" glyphs="{ROBOTO_REGULAR}" style="normal"
        stretch="normal" weight="400" />
  <type format="ttf" name="{FONT_MEDIUM}" fullname="Roboto Medium"
        family="Roboto" glyphs="{ROBOTO_MEDIUM}" style="normal"
        stretch="normal" weight="500" />
</typemap>
'''
    (directory / 'type.xml').write_text(font_map, encoding='utf-8')

    environment = os.environ.copy()
    environment['MAGICK_CONFIGURE_PATH'] = str(directory)
    listed = subprocess.run(
        ['magick', '-list', 'font'],
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    ).stdout
    for name in (FONT_REGULAR, FONT_MEDIUM):
        if f'Font: {name}' not in listed:
            raise RuntimeError(f'ImageMagick did not list required font: {name}')
    return environment


def read_ihdr(path):
    """Return width, height, bit depth, and colour type from a PNG IHDR."""
    header = path.read_bytes()[:29]
    if len(header) != 29 or header[:8] != b'\x89PNG\r\n\x1a\n':
        raise RuntimeError(f'Not a valid PNG: {path}')
    length, chunk_type = struct.unpack('>I4s', header[8:16])
    if length != 13 or chunk_type != b'IHDR':
        raise RuntimeError(f'PNG does not start with IHDR: {path}')
    width, height, depth, colour_type = struct.unpack('>IIBB', header[16:26])
    return width, height, depth, colour_type


def render_label(path, text, font, point_size, colour, environment):
    """Render and tightly trim one line of text."""
    run_magick([
        '-background', 'none',
        '-fill', colour,
        '-font', font,
        '-pointsize', str(point_size),
        f'label:{text}',
        '-trim', '+repage',
        f'PNG32:{path}',
    ], environment)
    width, height, _, _ = read_ihdr(path)
    if width < len(text) or height < point_size // 2:
        raise RuntimeError(f'Font did not render usable glyphs for: {text}')
    return width, height


def render_tile(specification, work, environment):
    """Render one vertically centred icon and text stack."""
    name, width, height, mark_size, mark_gap, title_size, text_gap, subtitle_size, left = specification
    title_path = work / f'{name}-title.png'
    subtitle_path = work / f'{name}-subtitle.png'
    mark_path = work / f'{name}-mark.png'

    title_width, title_height = render_label(
        title_path, TITLE, FONT_MEDIUM, title_size, PRIMARY, environment)
    subtitle_width, subtitle_height = render_label(
        subtitle_path, SUBTITLE, FONT_REGULAR, subtitle_size, SECONDARY, environment)
    run_magick([
        str(ICON),
        '-filter', 'Lanczos',
        '-resize', f'{mark_size}x{mark_size}!',
        f'PNG32:{mark_path}',
    ], environment)

    stack_height = mark_size + mark_gap + title_height + text_gap + subtitle_height
    mark_y = (height - stack_height) // 2
    title_y = mark_y + mark_size + mark_gap
    subtitle_y = title_y + title_height + text_gap

    if left is None:
        mark_x = (width - mark_size) // 2
        title_x = (width - title_width) // 2
        subtitle_x = (width - subtitle_width) // 2
    else:
        mark_x = title_x = subtitle_x = left

    output = STORE / name
    run_magick([
        '-size', f'{width}x{height}', f'xc:{BACKGROUND}',
        str(mark_path), '-geometry', f'+{mark_x}+{mark_y}', '-composite',
        str(title_path), '-geometry', f'+{title_x}+{title_y}', '-composite',
        str(subtitle_path), '-geometry', f'+{subtitle_x}+{subtitle_y}', '-composite',
        '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
        # Drop the timestamp chunks ImageMagick writes by default, so the same
        # input produces the same bytes and regenerating does not churn git.
        '-define', 'png:exclude-chunks=date,time',
        '-depth', '8', f'PNG24:{output}',
    ], environment)


def verify():
    """Print direct IHDR verification and fail if any store requirement fails."""
    failed = False
    for name, expected_width, expected_height, *_ in TILES:
        path = STORE / name
        width, height, depth, colour_type = read_ihdr(path)
        passed = (width, height, depth, colour_type) == (
            expected_width, expected_height, 8, 2)
        result = 'PASS' if passed else 'FAIL'
        print(
            f'{path.relative_to(ROOT)}: width={width} height={height} '
            f'bit_depth={depth} colour_type={colour_type} {result}'
        )
        failed = failed or not passed
    if failed:
        raise RuntimeError('One or more promotional tiles failed PNG verification')


def main():
    """Generate both tiles and verify their store-facing PNG headers."""
    STORE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        work = pathlib.Path(temporary)
        environment = configure_fonts(work)
        for specification in TILES:
            render_tile(specification, work, environment)
    verify()


if __name__ == '__main__':
    main()
