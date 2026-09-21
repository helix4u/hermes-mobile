"""Validate executed client frames against public OpenRPC JSON, without a host.

Run with a Python environment containing jsonschema. This is a data-contract
check only; actual creation/submission behavior belongs in dispatcher tests.
"""
import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

parser = argparse.ArgumentParser()
parser.add_argument("--contracts", required=True, type=Path)
parser.add_argument("--frames", required=True, type=Path)
args = parser.parse_args()
document = json.loads(args.contracts.read_text(encoding="utf-8"))
frames = json.loads(args.frames.read_text(encoding="utf-8"))["frames"]
methods = {method["name"]: method for method in document["methods"]}
questions = {method["name"]: method for method in document.get("x-server-requests", [])}
# Exercise the actual versioned Mobile adapter for its legacy answer envelope.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server-plugin"))
from mobile_server.request_compat import RequestCompatibility
failures = []
for index, frame in enumerate(frames):
    kind = frame["method"].removesuffix(".respond")
    if frame["method"].endswith(".respond") and kind in {"approval", "clarify", "sudo", "secret"}:
        bridge = RequestCompatibility()
        rid = frame["params"]["request_id"]
        bridge.from_core({"id": rid, "method": kind, "params": {"session_id": "synthetic-runtime"}})
        _, replies = bridge.from_phone({"jsonrpc": "2.0", "id": index, **frame})
        if len(replies) != 1 or replies[0].get("id") != rid or "result" not in replies[0]:
            failures.append({"index": index, "method": frame["method"], "reason": "adapter did not bind exact answer"})
            continue
        for error in Draft202012Validator({**document, **questions[kind]["result"]["schema"]}).iter_errors(replies[0]["result"]):
            failures.append({"index": index, "method": frame["method"], "path": list(error.absolute_path), "validator": error.validator})
        continue
    method = methods.get(frame["method"])
    if method is None:
        failures.append({"index": index, "method": frame["method"], "reason": "undeclared method"})
        continue
    schema = method["params"][0]["schema"]
    for error in Draft202012Validator({**document, **schema}).iter_errors(frame["params"]):
        # Never echo frame values. Synthetic cases today, safe diagnostics if reused.
        failures.append({"index": index, "method": frame["method"],
                         "path": list(error.absolute_path), "validator": error.validator})
print(json.dumps({"frames": len(frames), "failures": failures, "ok": not failures}))
raise SystemExit(1 if failures else 0)
