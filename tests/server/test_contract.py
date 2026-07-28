from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = PROJECT_ROOT / "server-plugin"
sys.path.insert(0, str(PLUGIN_ROOT))

from mobile_server.contract import CapabilityResponse, FeatureSet, HealthResponse


class ContractTests(unittest.TestCase):
    def test_capability_response_is_versioned_and_serializable(self) -> None:
        payload = CapabilityResponse(
            status="compatible",
            hermes_version="test",
            features=FeatureSet(revisioned_events=True),
        ).to_dict()

        self.assertEqual(payload["contract_version"], 1)
        self.assertEqual(payload["plugin_version"], "0.1.0")
        self.assertEqual(payload["status"], "compatible")
        self.assertTrue(payload["features"]["revisioned_events"])
        self.assertIsInstance(payload["details"], list)

    def test_health_response_keeps_compatibility_distinct(self) -> None:
        payload = HealthResponse(
            status="degraded",
            compatibility="incompatible",
        ).to_dict()

        self.assertEqual(payload["status"], "degraded")
        self.assertEqual(payload["compatibility"], "incompatible")


if __name__ == "__main__":
    unittest.main()
