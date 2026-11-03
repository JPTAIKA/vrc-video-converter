import zlib
import struct
import os

def create_png(width, height, r, g, b, a=255):
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = struct.pack('>I', zlib.crc32(b'IHDR' + ihdr))
    png += struct.pack('>I', len(ihdr)) + b'IHDR' + ihdr + ihdr_crc

    # Image data: cyan/blue gradient with a play triangle or rounded card look
    raw_data = bytearray()
    center_x = width / 2
    center_y = height / 2
    radius = min(width, height) / 2

    for y in range(height):
        raw_data.append(0) # Filter byte 0 (None)
        for x in range(width):
            dx = x - center_x
            dy = y - center_y
            dist = (dx * dx + dy * dy) ** 0.5

            if dist < radius:
                # Gradient cyan to blue (#06b6d4 to #3b82f6)
                t = (x + y) / (width + height)
                cr = int(6 + (59 - 6) * t)
                cg = int(182 + (130 - 182) * t)
                cb = int(212 + (246 - 212) * t)
                ca = a
                # Draw a simple white play triangle in the center
                # triangle bounds: x from 0.4*w to 0.7*w, y from 0.3*h to 0.7*h
                tri_left = width * 0.38
                tri_right = width * 0.72
                tri_top = height * 0.32
                tri_bottom = height * 0.68
                
                if tri_left <= x <= tri_right:
                    progress = (x - tri_left) / (tri_right - tri_left)
                    half_height = (height * 0.36) * (1 - progress)
                    if abs(y - center_y) <= half_height:
                        cr, cg, cb, ca = 255, 255, 255, 255

                raw_data.extend([cr, cg, cb, ca])
            else:
                raw_data.extend([0, 0, 0, 0])

    compressed = zlib.compress(bytes(raw_data))
    idat_crc = struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + idat_crc

    # IEND chunk
    iend_crc = struct.pack('>I', zlib.crc32(b'IEND'))
    png += struct.pack('>I', 0) + b'IEND' + iend_crc

    return png

icons_dir = os.path.join(os.path.dirname(__file__), "extension", "icons")
os.makedirs(icons_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size, 6, 182, 212)
    path = os.path.join(icons_dir, f"icon{size}.png")
    with open(path, "wb") as f:
        f.write(png_bytes)
    print(f"Generated {path} ({size}x{size})")
