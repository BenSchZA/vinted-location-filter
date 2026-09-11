"""Render the extension icons with supersampled edges.

Each output pixel averages an 8x8 grid of sub-samples, so curves get partial
coverage instead of the hard on/off pixels a single sample per pixel gives.
Averaging happens in premultiplied alpha to avoid a dark fringe where the
shape meets transparency.
"""
import struct, zlib, math

TEAL = (0, 119, 130)
WHITE = (255, 255, 255)
SS = 8  # sub-samples per axis


def sample(x, y, size):
    """Colour at a point in icon space, or None where the icon is transparent.

    The badge is a circle rather than a rounded square: a square leaves four
    transparent corners that read as dark wedges against a dark toolbar. A
    small margin keeps the shape off the edge of the canvas.
    """
    cx = cy = size / 2
    if math.hypot(x - cx, y - cy) > size * 0.47:
        return None                                   # outside the badge

    small = size <= 32
    hx, hy = size / 2, size * (0.415 if small else 0.42)
    hr = size * (0.175 if small else 0.16)
    tip_y = size * (0.75 if small else 0.74)
    half = size * (0.125 if small else 0.115)

    d = math.hypot(x - hx, y - hy)
    in_pin = d <= hr
    if not in_pin and hy <= y <= tip_y:
        t = (y - hy) / (tip_y - hy)
        if abs(x - hx) <= half * (1 - t):
            in_pin = True
    if in_pin and d > hr * (0.47 if small else 0.45):  # hole in the pin head
        return WHITE
    return TEAL


def render(path, size):
    rows = []
    step = 1.0 / SS
    for py in range(size):
        row = bytearray()
        for px in range(size):
            ar = ag = ab = aa = 0.0
            for sy in range(SS):
                y = py + (sy + 0.5) * step
                for sx in range(SS):
                    c = sample(px + (sx + 0.5) * step, y, size)
                    if c is not None:                  # premultiplied accumulate
                        ar += c[0]; ag += c[1]; ab += c[2]; aa += 255.0
            n = SS * SS
            alpha = aa / n
            if alpha < 0.5:
                row += bytes((0, 0, 0, 0))
            else:
                cover = aa / 255.0                     # covered sub-samples
                row += bytes((round(ar / cover), round(ag / cover),
                              round(ab / cover), round(alpha)))
        rows.append(bytes(row))

    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)
    print(f'{path}  {size}x{size}  {len(png)} bytes')


for s in (16, 32, 48, 128):
    render(f'extension/icons/icon{s}.png', s)
