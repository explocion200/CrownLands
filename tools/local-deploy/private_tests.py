"""Isolated private publication tests: actual crypto, hostile transport and gates."""
import base64
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request
import github_access as g
import upgrade_private as upgrade
import local_runtime
import tests as fixtures

SHA = 'a' * 40
HEAD = 'b' * 40
REPO = {'full_name': g.REPO, 'id': g.REPOSITORY_ID}
AUTH = {'pullRequest': 597, 'headSha': HEAD, 'gateRunId': 10, 'gateRunAttempt': 1}
GATE = {'id': 10, 'run_attempt': 1, 'event': 'pull_request', 'path': g.GATE, 'head_sha': HEAD,
        'repository': REPO, 'status': 'completed', 'conclusion': 'success', 'check_suite_id': 20}
CHECKS = [{'id': i + 30, 'name': name, 'app': {'slug': 'github-actions'}, 'head_sha': HEAD,
           'check_suite': {'id': 20}, 'status': 'completed', 'conclusion': 'success'} for i, name in enumerate(g.REQUIRED)]
PULL = {'number': 597, 'merged_at': '2026-10-17', 'merge_commit_sha': SHA,
        'base': {'ref': 'main', 'repo': REPO}, 'head': {'sha': HEAD}}


class CryptoTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.package = self.root/'local-game.tar.gz'; self.package.write_bytes(b'actual package bytes')
        self.key = self.root/'key.pem'; self.public = self.root/'public.pem'
        subprocess.run(['/usr/bin/openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(self.key)], check=True, capture_output=True)
        subprocess.run(['/usr/bin/openssl', 'pkey', '-in', str(self.key), '-pubout', '-out', str(self.public)], check=True, capture_output=True)
        self.env = {'GITHUB_REPOSITORY': g.REPO, 'GITHUB_REPOSITORY_ID': str(g.REPOSITORY_ID), 'GITHUB_REF': 'refs/heads/main',
                    'GITHUB_SHA': SHA, 'GITHUB_EVENT_NAME': 'push', 'RUNNER_ENVIRONMENT': 'github-hosted',
                    'GITHUB_RUN_ID': '40', 'GITHUB_RUN_ATTEMPT': '1'}
        self.envelope = self.root/'provenance.json'
        self.sign()

    def sign(self, env=None, auth=None):
        signer = Path(__file__).resolve().parents[1]/'sign-local-game.js'
        script = "const fs=require('node:fs');const {signPackage}=require(process.argv[1]);const x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(signPackage(Buffer.from(x.package,'base64'),x.auth,x.env,fs.readFileSync(process.argv[2]))))"
        raw = subprocess.check_output(['node', '-e', script, str(signer), str(self.key)], input=json.dumps({
            'package': base64.b64encode(self.package.read_bytes()).decode(), 'auth': auth or {'commit': SHA, **AUTH},
            'env': env or self.env}).encode(), stderr=subprocess.PIPE)
        self.envelope.write_bytes(raw)

    def verify(self, auth=AUTH):
        with patch.object(g, 'protected', side_effect=lambda p: Path(p).read_bytes()):
            return g.verify_signature(self.package, self.envelope, SHA, self.public, auth)

    def test_node_signer_openssl_verifier_round_trip(self):
        self.assertEqual(self.verify()['commit'], SHA)

    def test_tampered_package_payload_signature_and_wrong_key(self):
        original = self.envelope.read_bytes()
        for field in ('payload', 'signature'):
            value = json.loads(original); data = bytearray(base64.b64decode(value[field])); data[0] ^= 1
            value[field] = base64.b64encode(data).decode(); self.envelope.write_text(json.dumps(value))
            with self.assertRaises(ValueError): self.verify()
        self.envelope.write_bytes(original)
        self.package.write_bytes(b'different package')
        with self.assertRaisesRegex(ValueError, 'identity'): self.verify()
        self.package.write_bytes(b'actual package bytes')
        subprocess.run(['/usr/bin/openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(self.key)], check=True, capture_output=True)
        self.sign()
        with self.assertRaisesRegex(ValueError, 'signature'): self.verify()

    def test_signature_binds_repository_ref_commit_runner_event_and_authorization(self):
        for key, value in [('GITHUB_REPOSITORY', 'someone/other'), ('GITHUB_REPOSITORY_ID', '1'),
                           ('GITHUB_REF', 'refs/heads/other'), ('RUNNER_ENVIRONMENT', 'self-hosted'),
                           ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_RUN_ID', '0')]:
            with self.subTest(key=key), self.assertRaises(subprocess.CalledProcessError): self.sign({**self.env, key: value})
        self.sign({**self.env, 'GITHUB_SHA': 'c'*40}, {'commit': 'c'*40, **AUTH})
        with self.assertRaisesRegex(ValueError, 'identity'): self.verify()
        self.sign()
        with self.assertRaisesRegex(ValueError, 'identity'): self.verify({**AUTH, 'gateRunId': 11})

    def test_rsa_app_jwt_signature_and_short_lifetime(self):
        rsa = self.root/'app.pem'; public = self.root/'app-public.pem'
        subprocess.run(['/usr/bin/openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(rsa)], check=True, capture_output=True)
        subprocess.run(['/usr/bin/openssl', 'pkey', '-in', str(rsa), '-pubout', '-out', str(public)], check=True, capture_output=True)
        token = g.app_jwt(123, rsa.read_bytes(), 100000)
        header, claims, signature = token.split('.')
        decode = lambda s: base64.urlsafe_b64decode(s + '='*((-len(s)) % 4))
        self.assertEqual(json.loads(decode(claims)), {'iat': 99940, 'exp': 100540, 'iss': '123'})
        self.assertEqual(json.loads(decode(header))['alg'], 'RS256')
        signed = self.root/'signature'; signed.write_bytes(decode(signature))
        result = subprocess.run(['/usr/bin/openssl', 'dgst', '-sha256', '-verify', str(public), '-signature', str(signed)],
                                input=(header+'.'+claims).encode(), capture_output=True)
        self.assertEqual(result.returncode, 0)


class PrivateGitHubTests(unittest.TestCase):
    def client(self):
        client = object.__new__(g.Client); client.token = 'test-only-token'; return client

    def test_merged_exact_commit_and_workflow_checks_required(self):
        self.assertEqual(g.select_pull([PULL], SHA), PULL)
        for change in ({'merged_at': None}, {'merge_commit_sha': HEAD}, {'base': {'ref': 'other'}}):
            with self.assertRaises(ValueError): g.select_pull([{**PULL, **change}], SHA)
        self.assertEqual(g.select_gate([GATE], HEAD), GATE)
        for change in ({'path': 'other'}, {'head_sha': SHA}, {'event': 'push'}, {'conclusion': 'failure'}, {'repository': {**REPO, 'id': 1}}):
            with self.assertRaises(ValueError): g.select_gate([{**GATE, **change}], HEAD)
        with self.assertRaises(ValueError): g.select_gate([GATE, {**GATE, 'id': 11, 'status': 'in_progress'}], HEAD)
        g.require_checks(CHECKS, GATE, HEAD)
        for change in ({'check_suite': {'id': 21}}, {'head_sha': SHA}, {'app': {'slug': 'other'}}, {'conclusion': 'failure'}):
            with self.assertRaises(ValueError): g.require_checks([{**c, **change} for c in CHECKS], GATE, HEAD)
        with self.assertRaises(ValueError): g.require_checks(CHECKS + [{**CHECKS[0], 'id': 100, 'conclusion': 'failure'}], GATE, HEAD)

    def test_api_gate_uses_exact_suite_and_all_check_pages(self):
        client = self.client()
        with patch.object(client, 'repo', side_effect=[[PULL], {'sha': SHA, 'parents': [{'sha': 'c'*40}]},
                          {'status': 'ahead', 'merge_base_commit': {'sha': 'c'*40}}, {'total_count': 1, 'workflow_runs': [GATE]},
                          {'total_count': 3, 'check_runs': CHECKS[:2]}, {'total_count': 3, 'check_runs': CHECKS[2:]}]) as api:
            self.assertEqual(client.authorize(SHA), AUTH)
            self.assertIn('check-suites/20/check-runs?filter=all', api.call_args_list[4].args[0])
            self.assertTrue(api.call_args_list[5].args[0].endswith('page=2'))

    def test_pr_head_behind_main_before_merge_is_rejected(self):
        client = self.client()
        with patch.object(client, 'repo', side_effect=[[PULL], {'sha': SHA, 'parents': [{'sha': 'c'*40}]},
                          {'status': 'diverged', 'merge_base_commit': {'sha': 'd'*40}}]):
            with self.assertRaisesRegex(ValueError, 'current with main'): client.authorize(SHA)

    def test_publishing_run_must_finish_successfully_with_exact_identity(self):
        client = self.client()
        payload = {'runId': 40, 'runAttempt': 2, 'commit': SHA, 'event': 'push'}
        good = {'id': 40, 'run_attempt': 2, 'repository': REPO, 'path': g.PUBLISH, 'head_sha': SHA,
                'head_branch': 'main', 'event': 'push', 'status': 'completed', 'conclusion': 'success'}
        with patch.object(client, 'repo', return_value=good) as api:
            client.require_publication(payload)
            self.assertEqual(api.call_args.args[0], 'actions/runs/40/attempts/2')
            for change in ({'run_attempt': 1}, {'head_sha': HEAD}, {'path': 'other'}, {'head_branch': 'other'}, {'conclusion': 'failure'}):
                api.return_value = {**good, **change}
                with self.assertRaises(ValueError): client.require_publication(payload)
            api.return_value = {**good, 'status': 'in_progress'}
            with self.assertRaises(g.WaitingForBuild): client.require_publication(payload)

    def test_scoped_token_rejects_write_permissions_or_extra_repository(self):
        config = {'githubApp': {'appId': 1, 'installationId': 2, 'privateKeyFile': '/etc/crownlands-deploy/github-app.pem'}}
        token = {'token': 'fixture-token-with-no-fixed-length', 'permissions': g.PERMISSIONS}
        repos = {'total_count': 1, 'repositories': [REPO]}
        with patch.object(g, 'protected', return_value=b'fixture'), patch.object(g, 'app_jwt', return_value='fixture-jwt'), patch.object(g, 'request') as req:
            req.side_effect = [json.dumps(token).encode(), json.dumps(repos).encode()]
            g.Client(config)
            self.assertEqual(req.call_args_list[0].kwargs['body'], {'repository_ids': [g.REPOSITORY_ID], 'permissions': g.PERMISSIONS})
            req.side_effect = [json.dumps({**token, 'permissions': {**g.PERMISSIONS, 'contents': 'write'}}).encode()]
            with self.assertRaises(ValueError): g.Client(config)
            req.side_effect = [json.dumps(token).encode(), json.dumps({**repos, 'total_count': 2}).encode()]
            with self.assertRaises(ValueError): g.Client(config)

    def test_redirect_never_forwards_credentials_and_rejects_other_destinations(self):
        req = urllib.request.Request('https://api.github.com/repos/example/releases/assets/1')
        req.add_unredirected_header('Authorization', 'Bearer test-token'); req.crownlands_asset = True
        handler = g.AssetRedirect()
        redirected = handler.redirect_request(req, None, 302, '', {}, 'https://release-assets.githubusercontent.com/file?fixture')
        self.assertNotIn('Authorization', dict(redirected.header_items()))
        for url in ('http://release-assets.githubusercontent.com/file', 'https://evil.example/file', 'https://api.github.com/file',
                    'https://user@release-assets.githubusercontent.com/file', 'https://release-assets.githubusercontent.com:444/file'):
            with self.assertRaises(ValueError): handler.redirect_request(req, None, 302, '', {}, url)
        req.crownlands_asset = False
        with self.assertRaises(ValueError): handler.redirect_request(req, None, 302, '', {}, 'https://release-assets.githubusercontent.com/file')

    def test_http_errors_are_sanitized_and_response_is_bounded(self):
        with patch.object(g.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = urllib.error.HTTPError('https://example/?private-signature', 403, 'sensitive-body', {}, None)
            with self.assertRaises(g.GitHubError) as caught: g.request('/test', 'fixture-token')
            self.assertEqual(str(caught.exception), 'Private GitHub request failed (HTTP 403)')
            opener.return_value.open.side_effect = None
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'12345'
            with self.assertRaisesRegex(ValueError, 'size limit'): g.request('/test', 'fixture-token', 4)

    def test_private_key_requires_root_and_restricted_file_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/'key'; file.write_text('fixture'); file.chmod(0o600)
            if os.getuid() != 0:
                with self.assertRaises(ValueError): g.protected(file, private=True)
            else:
                self.assertEqual(g.protected(file, private=True), b'fixture')
            file.chmod(0o644)
            with self.assertRaises(ValueError): g.protected(file, private=True)
            link = Path(directory)/'link'; link.symlink_to(file)
            with self.assertRaises(OSError): g.protected(link, private=True)


class UpgradeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name); self.bundle = self.root/'bundle'; self.bundle.mkdir()
        self.installed = self.root/'installed'; self.installed.mkdir()
        self.destinations = {name: self.installed/name for name in upgrade.FILES}
        self.destinations['publisher.py'].write_bytes(b'previous publisher')
        self.destinations['config.json'].write_text(json.dumps({'approved': {'runtime': 'unchanged'}, 'localBackend': {'epoch': 'unchanged'}}))
        for name in upgrade.FILES: (self.bundle/name).write_bytes(b'new fixture ' + name.encode())
        old = json.loads(self.destinations['config.json'].read_bytes())
        (self.bundle/'config.json').write_text(json.dumps({**old, 'githubApp': {'fixture': True}}))
        self.plan = {'before': {n: upgrade.digest(p) for n, p in self.destinations.items()},
                     'after': {n: upgrade.digest(self.bundle/n) for n in upgrade.FILES}}
        self.save_plan()

    def save_plan(self): (self.bundle/'upgrade.json').write_text(json.dumps(self.plan))

    def test_success_preserves_policy_and_private_key_mode(self):
        upgrade.apply(self.bundle, self.destinations, self.root/'backup', lambda: None)
        self.assertEqual(self.destinations['github-app.pem'].stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root/'backup/publisher.py').read_bytes(), b'previous publisher')
        self.assertEqual(json.loads(self.destinations['config.json'].read_bytes())['approved'], {'runtime': 'unchanged'})

    def test_failed_verification_restores_previous_files_and_removes_only_new_files(self):
        def fail(): raise ValueError('fixture verification failure')
        with self.assertRaises(ValueError): upgrade.apply(self.bundle, self.destinations, self.root/'backup', fail)
        self.assertEqual({n: upgrade.digest(p) for n, p in self.destinations.items()}, self.plan['before'])

    def test_changed_source_or_installed_file_stops_before_writes(self):
        self.destinations['publisher.py'].write_bytes(b'operator update')
        with self.assertRaisesRegex(ValueError, 'precondition'): upgrade.apply(self.bundle, self.destinations, self.root/'backup', lambda: None)
        self.assertFalse((self.root/'backup').exists())

    def test_backend_fingerprint_changes_are_not_an_access_upgrade(self):
        config = json.loads((self.bundle/'config.json').read_bytes()); config['approved']['runtime'] = 'uninstalled'
        (self.bundle/'config.json').write_text(json.dumps(config))
        self.plan['after']['config.json'] = upgrade.digest(self.bundle/'config.json'); self.save_plan()
        with self.assertRaisesRegex(ValueError, 'preserve backend'): upgrade.validate(self.bundle, self.destinations)


class PrivatePublisherFlowTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PublicationTests('test_packaging_round_trip')
        self.fixture.setUp(); self.addCleanup(self.fixture.doCleanups)
        self.fixture.archive()
        self.client = MagicMock()
        self.client.main_head.return_value = fixtures.COMMIT
        self.client.authorize.return_value = AUTH
        self.client.release_assets.return_value = {'local-game.tar.gz': 'package', 'provenance.json': 'signature'}
        self.client.download_asset.side_effect = lambda name, limit: self.fixture.package.read_bytes() if name == 'package' else b'fixture'
        self.signature = patch.object(fixtures.p.github_access, 'verify_signature', return_value={'commit': fixtures.COMMIT})
        self.verify = self.signature.start(); self.addCleanup(self.signature.stop)
        client = patch.object(fixtures.p.github_access, 'Client', return_value=self.client)
        client.start(); self.addCleanup(client.stop)
        authority = patch.object(local_runtime, 'authority', return_value=None)
        authority.start(); self.addCleanup(authority.stop)

    def run_publisher(self, check=False):
        actual = fixtures.p.activate
        def activate(*args, **kwargs):
            return actual(*args, **kwargs, smoke_fn=lambda *_: None)
        with patch.object(fixtures.p, 'activate', side_effect=activate):
            return fixtures.p.run({'approved': fixtures.APPROVED}, self.fixture.host, self.fixture.state, check)

    def test_valid_private_release_activates_only_after_signature_run_and_gate_verification(self):
        self.assertEqual(self.run_publisher()['status'], 'deployed')
        self.verify.assert_called_once()
        self.client.require_publication.assert_called_once()
        self.assertEqual(self.client.authorize.call_count, 2)
        self.assertEqual(fixtures.p.current_release(self.fixture.host).name, 'auto-'+fixtures.COMMIT)

    def test_check_only_does_not_activate(self):
        self.assertEqual(self.run_publisher(True)['status'], 'verified-ready')
        self.assertEqual(fixtures.p.current_release(self.fixture.host), self.fixture.previous)

    def test_invalid_signature_and_pending_workflow_preserve_live_release(self):
        self.verify.side_effect = ValueError('fixture bad signature')
        with self.assertRaisesRegex(ValueError, 'signature'): self.run_publisher()
        self.client.require_publication.assert_not_called()
        self.verify.side_effect = None
        self.client.require_publication.side_effect = g.WaitingForBuild('fixture pending')
        self.assertEqual(self.run_publisher()['status'], 'waiting-for-github-build')
        self.assertEqual(fixtures.p.current_release(self.fixture.host), self.fixture.previous)

    def test_missing_pr_or_changed_gate_cannot_activate(self):
        self.client.authorize.side_effect = ValueError('fixture missing merged PR')
        with self.assertRaisesRegex(ValueError, 'merged PR'): self.run_publisher()
        self.client.release_assets.assert_not_called()
        self.client.authorize.side_effect = [AUTH, {**AUTH, 'gateRunId': 99}]
        with self.assertRaisesRegex(ValueError, 'authorization changed'): self.run_publisher()
        self.assertEqual(fixtures.p.current_release(self.fixture.host), self.fixture.previous)


if __name__ == '__main__':
    unittest.main()
