import numpy as np


def extract_page_features(page) -> list:
    """
    Extracts 8 layout features from a fitz.Page object.
    """
    # 1. Text block count (paragraphs)
    blocks = page.get_text("blocks")
    text_block_count = len([b for b in blocks if b[6] == 0])  # type 0 = text

    # 2. Image block count
    image_count = len([b for b in blocks if b[6] == 1])

    # 3. Page fill ratio (how much of page has content)
    rect = page.rect
    page_area = rect.width * rect.height
    content_area = sum((b[2] - b[0]) * (b[3] - b[1]) for b in blocks)
    fill_ratio = content_area / page_area if page_area > 0 else 0

    # 4. Horizontal line count (table indicator)
    paths = page.get_drawings()
    h_lines = sum(1 for p in paths if abs(p['rect'].height) < 3)

    # 5. Vertical line count (table column separator)
    v_lines = sum(1 for p in paths if abs(p['rect'].width) < 3)

    # 6. Grid score (h_lines * v_lines -> strong table signal)
    grid_score = min(h_lines * v_lines, 100) / 100

    # 7. Average words per block (long = TEXT, short = TABLE cell)
    words_per_block = np.mean([
        len(b[4].split()) for b in blocks if b[6] == 0 and b[4].strip()
    ]) if text_block_count > 0 else 0

    # 8. Font size variance (high variance = header/mixed, low = body text)
    try:
        spans = [s for block in page.get_text("dict")["blocks"]
                 if block.get("type") == 0
                 for line in block["lines"]
                 for s in line["spans"]]
        sizes = [s["size"] for s in spans]
        font_variance = np.std(sizes) if sizes else 0
    except Exception:
        font_variance = 0

    return [
        float(text_block_count),
        float(image_count),
        float(fill_ratio),
        float(h_lines),
        float(v_lines),
        float(grid_score),
        float(words_per_block),
        float(font_variance)
    ]
