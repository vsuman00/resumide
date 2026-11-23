import runpy
import unittest
from pathlib import Path

folder = Path(__file__).parent
primary = runpy.run_path(str(folder / "dash-geometry-probe.py"))["refine_word"]
decorate = runpy.run_path(str(folder / "numeric-punctuation.py"))["numeric_punctuation_refiner"]
refine = decorate(primary)


class NumericPunctuationTests(unittest.TestCase):
    left = ("2", 0, 10, 12, 28)
    right = ("8", 31, 10, 43, 28)
    en_dash = ("-", 15, 21, 29, 23)
    minus = ("—", 17, 19, 29, 21)
    short = ("-", 20, 21, 27, 23)
    long = ("—", 4, 21, 29, 23)

    def test_two_adjacent_digits_supply_range_geometry(self):
        self.assertEqual(refine([self.left, self.en_dash, self.right], None, []), "2–8")

    def test_inner_ascii_hyphen_stays_a_hyphen(self):
        self.assertEqual(refine([self.left, self.short, self.right], None, []), "2-8")

    def test_high_short_leading_mark_is_minus(self):
        self.assertEqual(refine([self.minus, self.right], None, []), "−8")

    def test_leading_hyphen_and_em_dash_stay_distinct(self):
        self.assertEqual(refine([self.short, self.right], None, []), "-8")
        self.assertEqual(refine([self.long, self.right], None, []), "—8")

    def test_leading_low_dash_stays_distinct_from_minus(self):
        self.assertEqual(refine([self.en_dash, self.right], None, []), "–8")

    def test_bracketed_mark_tolerates_partial_box_overlap(self):
        partly_overlapping = ("8", 24, 10, 36, 28)
        obscured_mark = ("8", 21, 10, 33, 28)
        self.assertEqual(
            refine([self.left, self.en_dash, partly_overlapping], None, []), "2–8"
        )
        self.assertEqual(
            refine([self.left, self.en_dash, obscured_mark], None, []), "2-8"
        )

    def test_gap_or_baseline_discontinuity_abstains(self):
        shifted = ("8", 55, 22, 67, 40)
        self.assertEqual(refine([self.left, self.en_dash, shifted], None, []), "2-8")
        self.assertEqual(refine([self.minus], [self.right], []), "—")


if __name__ == "__main__":
    unittest.main()
