import unittest
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from scripts.mobile_shared_runtime import BrokerBinding, BindingUnavailable, resolve_legacy_binding as resolve_binding


class BindingTests(unittest.TestCase):
    def binding(self):
        record = SimpleNamespace(home=str(Path('synthetic-home').resolve()), code_root='synthetic-code',
                                 generation='broker-a', worker_generation='worker-a', pid=42, port=24001)
        host = SimpleNamespace(pid=42)
        service = SimpleNamespace(_read_record=Mock(return_value=record), _same_process=Mock(return_value=True))
        hr = SimpleNamespace(ROLE_SERVE='serve', HOST_PROTOCOL_VERSION=1, HOST_IDENTITY_PATH='/api/host/identity',
                             read_record=Mock(return_value=host))
        return BrokerBinding(record, host, service, hr, 'synthetic-server-credential')

    def proof(self, path, *, generation='worker-a', code=True):
        return ({'pid': 42, 'role': 'serve', 'protocolVersion': 1} if path.endswith('identity') else
                {'worker_generation': generation, 'worker_current': True, 'code_current': code, 'current': code is True})

    def test_auth_proof_and_generation_are_required(self):
        binding = self.binding()
        with patch('scripts.mobile_shared_runtime._json', side_effect=lambda _url, path, _credential: self.proof(path)):
            self.assertTrue(binding.verify_current(new_binding=True))
        with patch('scripts.mobile_shared_runtime._json', side_effect=lambda _url, path, _credential: self.proof(path, generation='worker-b')):
            self.assertFalse(binding.verify_current(new_binding=True))

    def test_delayed_old_proof_cannot_publish_replacement(self):
        binding = self.binding()
        def delayed(_url, path, _credential):
            if path.endswith('status'):
                binding.service._read_record.return_value = None
            return self.proof(path)
        with patch('scripts.mobile_shared_runtime._json', side_effect=delayed):
            self.assertFalse(binding.verify_current(new_binding=True))

    def test_source_drift_does_not_invent_worker_death_for_existing_controls(self):
        binding = self.binding()
        with patch('scripts.mobile_shared_runtime._json', side_effect=lambda _url, path, _credential: self.proof(path, code=False)):
            self.assertTrue(binding.verify_current())
            self.assertFalse(binding.verify_current(new_binding=True))

    def test_frame_fence_has_no_process_inspection_and_repr_has_no_credential(self):
        binding = self.binding()
        self.assertTrue(binding.generation_current())
        binding.service._same_process.assert_not_called()
        self.assertNotIn(binding.credential, repr(binding))

    def test_false_truthy_code_status_does_not_pass(self):
        binding = self.binding()
        with patch('scripts.mobile_shared_runtime._json', side_effect=lambda _url, path, _credential: self.proof(path, code='true')):
            self.assertFalse(binding.verify_current(new_binding=True))

    def test_wrong_loaded_source_and_foreign_home_refuse_before_credential_read(self):
        root, home = Path('synthetic-code').resolve(), Path('synthetic-home').resolve()
        token = Mock()
        service = SimpleNamespace(__file__=str(root / 'hermes_cli' / 'shared_runtime_service.py'),
                                  shared_runtime_status=Mock(return_value=SimpleNamespace(home='foreign-home', code_root=str(root))))
        hr = SimpleNamespace(read_token=token)
        def imported(name): return service if name == 'hermes_cli.shared_runtime_service' else hr
        with patch.dict(os.environ), patch.object(sys, 'path', list(sys.path)), patch('scripts.mobile_shared_runtime.importlib.import_module', side_effect=imported):
            with self.assertRaises(BindingUnavailable):
                resolve_binding(home, root)
            token.assert_not_called()
            service.__file__ = str(root.parent / 'foreign-code' / 'hermes_cli' / 'shared_runtime_service.py')
            with self.assertRaises(BindingUnavailable):
                resolve_binding(home, root)
            token.assert_not_called()
