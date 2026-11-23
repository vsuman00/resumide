import runpy
import unittest
from pathlib import Path

probe = runpy.run_path(str(Path(__file__).with_name("dash-geometry-probe.py")))
refine_word = probe["refine_word"]


class DashGeometryTests(unittest.TestCase):
    anchors = [("A", 8, 10, 18, 30), ("F", 27, 10, 37, 30), ("7", 43, 10, 53, 30)]
    long_mark = ("—", 25, 18, 38, 20)
    digit = ("4", 41, 10, 51, 30)

    def test_keeps_attached_numeric_sign(self):
        self.assertEqual(refine_word([self.long_mark, self.digit], None, self.anchors), "—4")

    def test_keeps_separate_mark_before_number(self):
        self.assertEqual(refine_word([self.long_mark], [self.digit], self.anchors), "—")

    def test_recovers_attached_numeric_range(self):
        word = [("2", 12, 10, 22, 30), self.long_mark, self.digit]
        self.assertEqual(refine_word(word, None, self.anchors), "2–4")

    def test_keeps_short_mark_and_abstains_when_anchors_are_missing(self):
        short_mark = ("-", 25, 18, 33, 20)
        self.assertEqual(refine_word([short_mark], None, self.anchors), "-")
        self.assertEqual(refine_word([self.long_mark], None, self.anchors[:2]), "—")


if __name__ == "__main__":
    unittest.main()
