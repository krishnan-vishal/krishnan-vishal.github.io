import json
import tempfile
import unittest
from pathlib import Path
from scripts.sep01.provider_control import Provider, choose_provider, checkpoint, failover

class ProviderControlTest(unittest.TestCase):
    def setUp(self):
        self.local = Provider("local", True, True, True, 2)
        self.remote = Provider("remote", True, False, True, 5)
        self.unapproved = Provider("unapproved", False, True, True, 99)

    def test_local_preferred(self):
        self.assertEqual(choose_provider([self.remote, self.local], "PUBLIC"), "local")

    def test_restricted_stays_local(self):
        self.assertEqual(choose_provider([self.remote], "RESTRICTED"), None)

    def test_unapproved_never_selected(self):
        self.assertIsNone(choose_provider([self.unapproved], "PUBLIC"))

    def test_failover_preserves_identity_and_does_not_duplicate_pr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            state = dict(job_id="gpir-test-1", branch="test/sep01", head_sha="abc123",
                         sensitivity="PUBLIC", provider="local", status="LEASED",
                         attempt=1, pr_number=587)
            checkpoint(path, state)
            new = failover(path, [self.local, self.remote])
            self.assertEqual(new["provider"], "remote")
            self.assertEqual(new["attempt"], 2)
            self.assertEqual(new["pr_number"], 587)
            self.assertEqual(json.loads(path.read_text())["job_id"], "gpir-test-1")
            with self.assertRaises(ValueError):
                checkpoint(path, {**new, "pr_number": 588})

    def test_no_capacity_queues_safely(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "checkpoint.json"
            checkpoint(path, dict(job_id="1", branch="b", head_sha="s",
                                  sensitivity="RESTRICTED", provider="local", status="LEASED"))
            result = failover(path, [self.remote])
            self.assertEqual(result["status"], "QUEUED")
            self.assertIsNone(result["provider"])

if __name__ == "__main__":
    unittest.main()
