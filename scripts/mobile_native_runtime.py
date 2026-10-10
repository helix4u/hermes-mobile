"""Attach-only native gateway boundary. Pairing credentials never reach the owner."""
from dataclasses import dataclass
import importlib
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def key(path):
    return os.path.normcase(str(Path(path).resolve()))


@dataclass(frozen=True)
class NativeBinding:
    home: Path
    code_root: Path
    endpoint: object
    pid: int
    birth: float
    protocol: str = 'hermes-gateway-v1'
    credential: str = 'native-private-bootstrap'

    @property
    def origin(self):
        return self.endpoint.api_origin

    @property
    def scope(self):
        return (str(self.home), self.endpoint.instance_id, self.endpoint.authority_epoch)

    def generation_current(self):
        import psutil
        try:
            return psutil.Process(self.pid).create_time() == self.birth
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False

    def verify_current(self, *, new_binding=False):
        try:
            current = resolve_native_binding(self.home, self.code_root, check_contract=False)
            return current.scope == self.scope and current.pid == self.pid and current.birth == self.birth
        except (OSError, ValueError, RuntimeError):
            return False

    def for_profile(self, profile='default'):
        if not isinstance(profile, str):
            raise ValueError('Invalid profile selection')
        from hermes_cli.gateway_runtime import discover_gateway_endpoint
        from hermes_cli.profiles import get_profile_dir
        home = self.home if profile in {'', 'current', 'default'} else get_profile_dir(profile)
        found = discover_gateway_endpoint(home)
        if found.state != 'ready' or found.endpoint is None or found.endpoint.instance_id != self.endpoint.instance_id:
            raise ValueError('Selected profile is not served by the captured gateway')
        return found.endpoint

    def http_headers(self, profile='default', *, profile_admin=False):
        from hermes_cli.gateway_client import _session_ticket
        endpoint = self.for_profile('default' if profile_admin else profile)
        purpose = 'native-profile-admin' if profile_admin else 'native-http'
        return {'X-Hermes-Gateway-Ticket': _session_ticket(Path(endpoint.profile_id), endpoint, purpose=purpose)}

    def websocket_target(self, profile='default'):
        from hermes_cli.gateway_client import _session_ticket, gateway_ws_target
        endpoint = self.for_profile(profile)
        return gateway_ws_target(endpoint, _session_ticket(Path(endpoint.profile_id), endpoint))

    def public_metadata(self):
        return {'Url': self.origin, 'AccessTokenFile': str(self.home / 'mobile-server' / 'session-token'),
                'Profile': 'default', 'IdentityKey': '|'.join(map(str, self.scope)),
                'OwnerKind': 'canonical-gateway', 'BrokerHome': str(self.home), 'CodeRoot': str(self.code_root)}

    def read_mobile_credential(self, path):
        expected = self.home / 'mobile-server' / 'session-token'
        if key(path) != key(expected):
            raise ValueError('Mobile credential belongs to another home')
        if os.name == 'nt':
            reader = importlib.import_module('hermes_cli.windows_ssh_runtime')
            if key(Path(reader.__file__).parent.parent) != key(self.code_root):
                raise ValueError('Credential reader belongs to another source')
            raw = reader._read_shared(Path(path), 4096, reader._win32().win32con.FILE_SHARE_READ)
            if raw is None:
                raise ValueError('Mobile credential unavailable')
        else:
            node = Path(path).stat()
            if node.st_uid != os.getuid() or node.st_mode & 0o077:
                raise ValueError('Mobile credential permissions are unsafe')
            raw = Path(path).read_bytes()
        value = raw.decode('utf-8-sig').strip()
        if len(value) < 43 or any(character in value for character in '\r\n'):
            raise ValueError('Mobile credential is invalid')
        return value


def resolve_native_binding(home, code_root, *, expected_identity='', check_contract=True):
    home, code_root = Path(home).resolve(), Path(code_root).resolve()
    os.environ['HERMES_HOME'] = str(home)
    sys.path.insert(0, str(code_root))
    runtime = importlib.import_module('hermes_cli.gateway_runtime')
    if key(Path(runtime.__file__).parent.parent) != key(code_root):
        raise ValueError('Gateway discovery belongs to another source')
    found = runtime.discover_gateway_endpoint(home)
    if found.state != 'ready' or found.endpoint is None:
        raise ValueError('Canonical gateway is unavailable')
    endpoint = found.endpoint
    from hermes_cli.gateway_runtime_discovery import query_private_control
    control_home = runtime.control_home_for(home, endpoint)
    proof = query_private_control(control_home, 'operator-lifecycle', params={
        'action': 'status', 'instance_id': endpoint.instance_id})
    if key(proof.get('code_root') or '') != key(code_root) or proof.get('instance_id') != endpoint.instance_id:
        raise ValueError('Gateway source identity differs')
    binding = NativeBinding(home, code_root, endpoint, proof['pid'], proof['birth'])
    if not binding.generation_current():
        raise ValueError('Gateway process identity differs')
    import psutil
    parsed = urlsplit(endpoint.api_origin)
    if not any(peer.status == psutil.CONN_LISTEN and peer.laddr.port == parsed.port
               and peer.laddr.ip in {'127.0.0.1', '::1'}
               for peer in psutil.Process(binding.pid).net_connections(kind='tcp')):
        raise ValueError('Gateway does not own the discovered listener')
    if expected_identity and binding.public_metadata()['IdentityKey'] != expected_identity:
        raise ValueError('Gateway generation changed')
    if check_contract:
        import httpx
        with httpx.Client(trust_env=False, follow_redirects=False, timeout=5) as client:
            for suffix in ('health', 'capabilities'):
                response = client.get(binding.origin + '/api/plugins/hermes-mobile/v1/' + suffix,
                                      headers=binding.http_headers())
                payload = response.json()
                if response.status_code != 200 or payload.get('contract_version') != 1 or payload.get('status') not in {'ok', 'compatible'}:
                    raise ValueError('Gateway has no compatible Mobile contract')
    return binding
