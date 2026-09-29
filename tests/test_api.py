import csv
from io import BytesIO, StringIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app({"TESTING": True, "DATABASE": str(Path(self.temp.name) / "test.sqlite3"), "GROQ_API_KEY": ""})
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def state(self):
        response = self.client.get("/api/state")
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def csv_upload(self, path, content, extra=None):
        data = {"file": (BytesIO(content.encode("utf-8")), "dataset.csv")}
        data.update(extra or {})
        return self.client.post(path, data=data, content_type="multipart/form-data")

    def test_bootstraps_demo_and_serves_frontend(self):
        state = self.state()
        self.assertEqual(state["stats"]["records"], 16)
        self.assertEqual(state["stats"]["demo_references"], 8)
        self.assertGreater(state["stats"]["candidates"], 0)
        self.assertEqual(state["stats"]["approved"], 0)
        self.assertNotIn("GROQ_API_KEY", str(state))
        self.assertEqual(self.client.get("/health").get_json()["status"], "ok")
        self.assertIn(b"One material.", self.client.get("/").data)
        self.assertEqual(self.client.get("/api/templates/materials.csv").status_code, 200)

    def test_compare_blocks_near_miss_and_works_without_key(self):
        response = self.client.post("/api/compare", json={"left": "Bearing 6205", "right": "Bearing 6206", "use_ai": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["tier"], "blocked")
        self.assertIsNone(response.json["reference"])
        self.assertIn("not configured", response.json["warning"])
        self.assertEqual(self.client.post("/api/compare", json={"left": "a", "right": "Bearing 6205"}).status_code, 400)

    def test_review_mapping_audit_export_and_rerun(self):
        pair = next(item for item in self.state()["candidates"] if item["suggested_code"] == "DEMO-BRG-6205")
        response = self.client.post(f"/api/candidates/{pair['id']}/review", json={
            "decision": "approved", "mapping_code": pair["suggested_code"], "note": "Specs checked"
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.state()["stats"]["mapped"], 1)
        export = self.client.get("/api/export/master.csv")
        rows = list(csv.DictReader(StringIO(export.get_data(as_text=True))))
        self.assertEqual(rows[0]["reference_type"], "illustrative demo")
        self.assertEqual(rows[0]["reviewer_note"], "Specs checked")
        self.assertIn("approved", self.client.get("/api/export/audit.csv").get_data(as_text=True))
        self.assertEqual(self.client.post("/api/analysis/run", json={"use_ai": False}).status_code, 200)
        updated = next(item for item in self.state()["candidates"] if item["id"] == pair["id"])
        self.assertEqual(updated["status"], "approved")
        self.assertEqual(updated["mapping_code"], "DEMO-BRG-6205")

    def test_mapping_with_conflicting_reference_is_rejected(self):
        pair = next(item for item in self.state()["candidates"] if item["suggested_code"] == "DEMO-BRG-6205")
        response = self.client.post(f"/api/candidates/{pair['id']}/review", json={
            "decision": "approved", "mapping_code": "DEMO-BRG-6206", "note": "Test"
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("conflicts", response.json["error"])
        self.assertEqual(self.state()["stats"]["approved"], 0)

    def test_import_and_reset(self):
        invalid = self.csv_upload("/api/import/records", "source,bad_header\nONGC,X\n")
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(self.state()["stats"]["records"], 16)
        data = "source,external_id,description\nA,1,Bearing 6205\nB,2,6205 ball bearing\n"
        response = self.csv_upload("/api/import/records", data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.state()["stats"]["records"], 2)
        self.assertEqual(self.state()["stats"]["references"], 8)
        self.assertEqual(self.state()["stats"]["candidates"], 1)
        self.assertEqual(self.client.post("/api/demo/reset", json={}).status_code, 400)
        self.assertEqual(self.client.post("/api/demo/reset", json={"confirm": "RESET_DEMO"}).status_code, 200)
        self.assertEqual(self.state()["stats"]["records"], 16)

    def test_append_retains_validated_knowledge_and_rejects_duplicate_ids(self):
        pair = next(item for item in self.state()["candidates"] if item["suggested_code"] == "DEMO-BRG-6205")
        self.client.post(f"/api/candidates/{pair['id']}/review", json={
            "decision": "approved", "mapping_code": "DEMO-BRG-6205", "note": "Trusted historical link"
        })
        incoming = "source,external_id,description\nPOWER,NEW-1,6205 ball bearing\n"
        response = self.csv_upload("/api/import/records", incoming, {"mode": "append"})
        self.assertEqual(response.status_code, 200)
        state = self.state()
        self.assertEqual(state["stats"]["records"], 17)
        self.assertEqual(state["stats"]["approved"], 1)
        self.assertEqual(state["stats"]["mapped"], 1)
        self.assertTrue(any(p["left"]["source"] == "POWER" or p["right"]["source"] == "POWER" for p in state["candidates"]))
        again = self.csv_upload("/api/import/records", incoming, {"mode": "append"})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self.state()["stats"]["records"], 17)

    def test_reference_replacement_retains_decision_but_unmaps(self):
        pair = next(item for item in self.state()["candidates"] if item["suggested_code"] == "DEMO-BRG-6205")
        self.client.post(f"/api/candidates/{pair['id']}/review", json={"decision": "approved", "mapping_code": pair["suggested_code"]})
        csv_data = "code,description\nCNMC-AUTHORIZED-1,Deep Groove Ball Bearing 6205\nCNMC-AUTHORIZED-2,Deep Groove Ball Bearing 6206\n"
        response = self.csv_upload("/api/import/references", csv_data, {"confirm": "REPLACE_REFERENCES"})
        self.assertEqual(response.status_code, 200)
        state = self.state()
        updated = next(item for item in state["candidates"] if item["id"] == pair["id"])
        self.assertEqual(updated["status"], "approved")
        self.assertIsNone(updated["mapping_code"])
        self.assertEqual(updated["suggested_code"], "CNMC-AUTHORIZED-1")
        self.assertEqual(state["stats"]["demo_references"], 0)
        self.assertEqual(state["stats"]["mapped"], 0)
        self.assertIn("mapping_cleared", self.client.get("/api/export/audit.csv").get_data(as_text=True))

    def test_groq_enriches_only_a_small_shortlist(self):
        self.app.config["GROQ_API_KEY"] = "fake-key"
        def fake_assessment(items, api_key, model):
            self.assertLessEqual(len(items), 8)
            self.assertEqual(api_key, "fake-key")
            return {item["id"]: {"equivalent": True, "semantic_similarity": .94, "reason": "Shared designation."} for item in items}
        with patch("cosmos.service.assess_pairs", side_effect=fake_assessment):
            result = self.client.post("/api/analysis/run", json={"use_ai": True})
        self.assertEqual(result.status_code, 200)
        self.assertGreater(result.json["run"]["ai_enriched"], 0)
        self.assertTrue(any(item["engine"] == "groq_assisted" for item in self.state()["candidates"]))

    def test_invalid_json_and_csv_formula_are_handled(self):
        self.assertEqual(self.client.post("/api/analysis/run", json=[1, 2]).status_code, 400)
        self.assertEqual(self.client.post("/api/compare", json="bad").status_code, 400)
        data = "source,external_id,description\n=2+2,1,Bearing 6205\nB,2,6205 ball bearing\n"
        self.assertEqual(self.csv_upload("/api/import/records", data).status_code, 200)
        pair = self.state()["candidates"][0]
        self.client.post(f"/api/candidates/{pair['id']}/review", json={"decision": "approved", "mapping_code": None})
        exported = self.client.get("/api/export/master.csv").get_data(as_text=True)
        self.assertIn("'=2+2", exported)


if __name__ == "__main__":
    unittest.main()
