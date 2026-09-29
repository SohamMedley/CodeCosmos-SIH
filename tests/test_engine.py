import json
import unittest
from io import BytesIO
from unittest.mock import patch

from cosmos.engine import best_reference, compare, extract_attributes, normalize
from cosmos.groq import GroqUnavailable, assess_pairs


class MaterialEngineTests(unittest.TestCase):
    def test_unit_conversion_and_synonyms(self):
        a = extract_attributes("SS Bolt M10 x 50 mm Grade 8.8")
        b = extract_attributes("Stainless Steel Hex Bolt M10 × 5 cm Gr 8.8")
        self.assertEqual(a["length_mm"], b["length_mm"])
        self.assertEqual(a["material"], "stainless steel")
        self.assertEqual(a["thread_mm"], 10)
        self.assertEqual(a["grade"], "8.8")
        self.assertIn("50 mm", normalize("M10 x 5 cm"))
        result = compare("SS Bolt M10 x 50 mm Grade 8.8", "Stainless Steel Hex Bolt M10 × 5 cm Gr 8.8")
        self.assertTrue(result["eligible"])
        self.assertEqual(result["tier"], "fast_track")

    def test_bearing_designation_conflict_cannot_be_overridden_by_model(self):
        ai = {"equivalent": True, "semantic_similarity": 1.0, "reason": "Same bearing."}
        result = compare("Bearing 6205", "Bearing 6206", ai)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["tier"], "blocked")
        self.assertLessEqual(result["score"], 0.29)
        self.assertIn("Bearing designation differs", result["conflicts"][0])

    def test_length_and_grade_conflicts_are_blocked(self):
        for other, expected in [
            ("SS Bolt M10 x 60 mm Grade 8.8", "Length differs"),
            ("SS Bolt M10 x 50 mm Grade 10.9", "Grade differs"),
        ]:
            with self.subTest(other=other):
                result = compare("SS Bolt M10 x 50 mm Grade 8.8", other)
                self.assertFalse(result["eligible"])
                self.assertTrue(any(expected in conflict for conflict in result["conflicts"]))

    def test_steel_unspecified_is_uncertain_but_copper_is_conflict(self):
        unclear = compare("Steel Bolt M10 x 50 mm", "Stainless Steel Bolt M10 x 50 mm")
        self.assertFalse(unclear["conflicts"])
        self.assertTrue(unclear["warnings"])
        different = compare("Steel Cable 2.5 mm2 3 core", "Copper Cable 2.5 mm2 3 core")
        self.assertTrue(different["conflicts"])

    def test_missing_spec_and_manufacturer_do_not_fast_track(self):
        missing = compare("SS Bolt M10 x 50 mm Grade 8.8", "SS Bolt M10 x 50 mm")
        self.assertEqual(missing["tier"], "review")
        self.assertLessEqual(missing["score"], .82)
        brand = compare("Bearing 6205", "SKF 6205 bearing")
        self.assertEqual(brand["tier"], "review")
        self.assertTrue(any("Manufacturer" in text for text in brand["warnings"]))

    def test_other_attributes(self):
        self.assertEqual(extract_attributes("MS Pipe DN50 PN16")["pn"], 16)
        self.assertEqual(extract_attributes("3 Core Copper Cable 2.5 mm2")["area_mm2"], 2.5)
        self.assertTrue(compare("MS Pipe DN50 PN16", "Mild Steel Pipe DN50 PN25")["conflicts"])
        self.assertTrue(compare("3 Core Copper Cable 2.5 mm2", "3 Core Copper Cable 4 sqmm")["conflicts"])

    def test_compact_bolt_and_optional_engineering_specs(self):
        compact = extract_attributes("Bolt M10x50mm SS Grade 8.8")
        self.assertEqual(compact["thread_mm"], 10)
        self.assertEqual(compact["length_mm"], 50)
        self.assertIn("m10 x 50 mm", normalize("Bolt M10x50mm"))
        self.assertTrue(compare("Bearing 6205-2RS", "Bearing 6205-ZZ")["conflicts"])
        self.assertEqual(compare("Bearing 6205-2RS", "Bearing 6205")["tier"], "review")
        self.assertTrue(compare("MS Pipe DN50 PN16 SCH40", "MS Pipe DN50 PN16 SCH80")["conflicts"])

    def test_reference_must_fit_both_descriptions(self):
        refs = [
            {"code": "WRONG", "description": "Bearing 6206", "is_demo": False},
            {"code": "RIGHT", "description": "Deep Groove Ball Bearing 6205", "is_demo": False},
        ]
        self.assertEqual(best_reference("Bearing 6205", "6205 Ball Bearing", refs)["code"], "RIGHT")
        self.assertIsNone(best_reference("Bearing 6205", "Bearing 6206", refs))


class GroqClientTests(unittest.TestCase):
    def test_structured_batch_and_authorization(self):
        response = {"choices": [{"message": {"content": json.dumps({"matches": [
            {"id": "1", "equivalent": True, "semantic_similarity": .92, "reason": "Same model."},
            {"id": "2", "equivalent": True, "semantic_similarity": 42, "reason": "Invalid score."},
        ]})}}]}
        with patch("cosmos.groq.urlopen", return_value=BytesIO(json.dumps(response).encode())) as mocked:
            matches = assess_pairs([{"id": "1", "left": "Bearing 6205", "right": "6205 bearing"},
                                    {"id": "2", "left": "a", "right": "b"}], "test-secret")
        self.assertEqual(list(matches), ["1"])
        request = mocked.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")
        self.assertNotIn("test-secret", request.data.decode())

    def test_unexpected_provider_output_falls_back(self):
        bad = {"choices": [{"message": {"content": "[]"}}]}
        with patch("cosmos.groq.urlopen", return_value=BytesIO(json.dumps(bad).encode())):
            with self.assertRaises(GroqUnavailable):
                assess_pairs([{"id": "1", "left": "a", "right": "b"}], "secret")


if __name__ == "__main__":
    unittest.main()
