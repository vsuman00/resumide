"""Measured punctuation candidate for registered synthetic OCR experiments."""


def numeric_punctuation_refiner(previous):
    def refine(word, next_word, anchors):
        baseline = previous(word, next_word, anchors)
        refined = list(baseline)
        for index, symbol in enumerate(word[:-1]):
            if symbol[0] not in "-—":
                continue
            right_digit = word[index + 1]
            if not right_digit[0].isascii() or not right_digit[0].isdecimal():
                continue
            left_digit = word[index - 1] if index else None
            if left_digit and left_digit[0].isascii() and left_digit[0].isdecimal():
                mark = classify_numeric_mark(symbol, right_digit, left_digit)
            elif index == 0:
                mark = classify_numeric_mark(symbol, right_digit)
            else:
                continue
            if mark:
                refined[index] = mark
        return "".join(refined)

    return refine


def classify_numeric_mark(symbol, right_digit, left_digit=None):
    _, left, top, right, bottom = symbol
    _, digit_left, digit_top, _, digit_bottom = right_digit
    height = digit_bottom - digit_top
    # Adjacent OCR boxes can overlap. A bracketed mark must still have
    # a majority of its width outside the right digit's estimated box.
    overlap = 0.10 * height if left_digit is None else 0.40 * (right - left)
    if height < 12 or not -overlap <= digit_left - right <= 0.45 * height:
        return None
    thickness = (bottom - top) / height
    if not 0 < thickness <= 0.26:
        return None
    width = (right - left) / height
    elevation = (digit_bottom - (top + bottom) / 2) / height
    if left_digit is None:
        # Keep both bands separate. Em dashes, hyphens and measurements
        # that fall between the bands retain their primary transcription.
        if 0.60 <= width <= 0.76 and 0.43 <= elevation <= 0.56:
            return "−"
        if 0.69 <= width <= 0.92 and 0.27 <= elevation <= 0.42:
            return "–"
        return None

    _, _, left_top, left_right, left_bottom = left_digit
    left_height = left_bottom - left_top
    stable_digits = (
        0.85 * height <= left_height <= 1.15 * height
        and abs(left_bottom - digit_bottom) <= 0.13 * height
        and -0.10 * height <= left - left_right <= 0.45 * height
    )
    if stable_digits and 0.62 <= width <= 0.90 and 0.27 <= elevation <= 0.42:
        return "–"
    return None
