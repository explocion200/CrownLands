"""Private GitHub transport and independent release authorization. No owner token."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = 'explocion200/CrownLands'
REPOSITORY_ID = 1269252620
GATE = '.github/workflows/crownlands-release-gate.yml'
PUBLISH = '.github/workflows/crownlands-local-publish.yml'
REQUIRED = ('Static validation', 'Multiplayer emulator validation', 'Validate')
PERMISSIONS = {'actions': 'read', 'checks': 'read', 'contents': 'read', 'pull_requests': 'read', 'metadata': 'read'}
SHA = re.compile(r'[0-9a-f]{40}')


class GitHubError(ValueError):
    def __init__(self, status):
        self.status = status
        super().__init__('Private GitHub request failed (HTTP %s)' % status)


class WaitingForBuild(ValueError):
    pass


def protected(path, private=False):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as file:
        info = os.fstat(file.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_size > 16384
                or info.st_mode & (0o077 if private else 0o022)):
            raise ValueError('Root-owned protected GitHub credential/key required')
        return file.read()


def b64url(data):
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def app_jwt(app_id, key, timestamp=None):
    now = int(time.time() if timestamp is None else timestamp)
    body = '.'.join(b64url(json.dumps(v, separators=(',', ':')).encode()) for v in (
        {'alg': 'RS256', 'typ': 'JWT'}, {'iat': now - 60, 'exp': now + 540, 'iss': str(app_id)}))
    with tempfile.TemporaryDirectory(prefix='crownlands-app-') as folder:
        path = Path(folder) / 'key.pem'
        path.write_bytes(key); path.chmod(0o600)
        result = subprocess.run(['/usr/bin/openssl', 'dgst', '-sha256', '-sign', str(path)],
                                input=body.encode(), capture_output=True, timeout=10)
    if result.returncode:
        raise ValueError('GitHub App signing failed')
    return body + '.' + b64url(result.stdout)


class AssetRedirect(urllib.request.HTTPRedirectHandler):
    """Only asset downloads may redirect, and credentials NEVER follow them."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if (req.get_method() != 'GET' or getattr(req, 'crownlands_asset', False) is not True
                or target.scheme != 'https' or target.hostname not in
                {'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}
                or target.username or target.password or target.port not in (None, 443)):
            raise ValueError('Unapproved private GitHub redirect')
        request = urllib.request.Request(newurl, headers={'User-Agent': 'Crownlands-local-publisher/2'})
        request.crownlands_asset = True
        return request


def request(path, token, limit=2 * 1024 * 1024, body=None, asset=False):
    if not path.startswith('/') or path.startswith('//') or any(c in path for c in '\r\n#'):
        raise ValueError('Invalid GitHub API path')
    headers = {'Accept': 'application/octet-stream' if asset else 'application/vnd.github+json',
               'User-Agent': 'Crownlands-local-publisher/2', 'X-GitHub-Api-Version': '2022-11-28'}
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request('https://api.github.com' + path, data=data, headers=headers)
    req.add_unredirected_header('Authorization', 'Bearer ' + token)
    req.crownlands_asset = asset
    try:
        with urllib.request.build_opener(AssetRedirect).open(req, timeout=45) as response:
            raw = response.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('Private GitHub response exceeds size limit')
        return raw
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        raise GitHubError(status) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        # Never put a token, signed CDN URL or HTTP body in logs/status.
        raise ValueError('Private GitHub network request failed') from None


def require_repository(value):
    if value.get('full_name') != REPO or value.get('id') != REPOSITORY_ID:
        raise ValueError('GitHub repository identity mismatch')


def select_pull(pulls, sha):
    for pr in pulls:
        if (pr.get('merged_at') and pr.get('merge_commit_sha') == sha
                and pr.get('base', {}).get('ref') == 'main'):
            require_repository(pr['base']['repo'])
            if SHA.fullmatch(pr.get('head', {}).get('sha', '')):
                return pr
    raise ValueError('Publication requires a merged PR for this exact main commit')


def select_gate(runs, head):
    matches = [r for r in runs if r.get('head_sha') == head and r.get('event') == 'pull_request'
               and r.get('path') == GATE]
    if not matches:
        raise ValueError('Release gate missing for exact PR head')
    run = max(matches, key=lambda r: r['id'])
    require_repository(run.get('repository', {}))
    if run.get('status') != 'completed' or run.get('conclusion') != 'success':
        raise ValueError('Latest release gate has not passed')
    return run


def require_checks(checks, gate, head):
    for name in REQUIRED:
        matches = [c for c in checks if c.get('name') == name and c.get('head_sha') == head
                   and c.get('app', {}).get('slug') == 'github-actions'
                   and c.get('check_suite', {}).get('id') == gate['check_suite_id']]
        latest = max(matches, key=lambda c: c['id']) if matches else {}
        if latest.get('status') != 'completed' or latest.get('conclusion') != 'success':
            raise ValueError('Required check has not passed in the trusted release gate: ' + name)


class Client:
    def __init__(self, config):
        app = config.get('githubApp', {})
        if (set(app) != {'appId', 'installationId', 'privateKeyFile'}
                or any(type(app.get(k)) is not int or app[k] <= 0 for k in ('appId', 'installationId'))
                or app.get('privateKeyFile') != '/etc/crownlands-deploy/github-app.pem'):
            raise ValueError('Reviewed private GitHub App configuration required')
        jwt = app_jwt(app['appId'], protected(app['privateKeyFile'], private=True))
        result = json.loads(request('/app/installations/%s/access_tokens' % app['installationId'], jwt,
                                   body={'repository_ids': [REPOSITORY_ID], 'permissions': PERMISSIONS}))
        if result.get('permissions') != PERMISSIONS or not isinstance(result.get('token'), str) or not result['token']:
            raise ValueError('GitHub App token must grant only the reviewed read permissions')
        self.token = result['token']  # Short-lived; never persisted or printed.
        repos = self.json('/installation/repositories?per_page=100')
        if repos.get('total_count') != 1 or len(repos.get('repositories', [])) != 1:
            raise ValueError('GitHub App token must be scoped to exactly one repository')
        require_repository(repos['repositories'][0])

    def json(self, path):
        return json.loads(request(path, self.token))

    def repo(self, path):
        return self.json('/repos/' + REPO + '/' + path)

    def main_head(self):
        sha = self.repo('commits/main').get('sha', '')
        if not SHA.fullmatch(sha):
            raise ValueError('Invalid private main commit')
        return sha

    def authorize(self, sha):
        pr = select_pull(self.repo('commits/' + sha + '/pulls?per_page=100'), sha)
        head = pr['head']['sha']
        commit = self.repo('commits/' + sha)
        parents = commit.get('parents', [])
        if commit.get('sha') != sha or not parents or not SHA.fullmatch(parents[0].get('sha', '')):
            raise ValueError('Merged commit parent identity missing')
        parent = parents[0]['sha']
        comparison = self.repo('compare/' + parent + '...' + head)
        if (comparison.get('status') not in ('ahead', 'identical')
                or comparison.get('merge_base_commit', {}).get('sha') != parent):
            raise ValueError('Reviewed PR head was not current with main before merge')
        runs = self.repo('actions/workflows/crownlands-release-gate.yml/runs?event=pull_request&head_sha='
                         + head + '&per_page=100')
        if runs.get('total_count', 0) > 100:
            raise ValueError('Too many gate runs to authorize safely')
        gate = select_gate(runs['workflow_runs'], head)
        checks = []
        for page in range(1, 11):
            data = self.repo('check-suites/%s/check-runs?filter=all&per_page=100&page=%s' % (gate['check_suite_id'], page))
            checks.extend(data['check_runs'])
            if len(checks) >= data['total_count']:
                break
        else:
            raise ValueError('Too many checks to authorize safely')
        require_checks(checks, gate, head)
        return {'pullRequest': pr['number'], 'headSha': head, 'gateRunId': gate['id'], 'gateRunAttempt': gate['run_attempt']}

    def release_assets(self, sha):
        try:
            release = self.repo('releases/tags/local-game-' + sha)
        except GitHubError as error:
            if error.status == 404:
                raise WaitingForBuild('Private release not uploaded yet') from None
            raise
        if release.get('draft') or release.get('tag_name') != 'local-game-' + sha:
            raise ValueError('Private release identity mismatch')
        selected = {}
        for name in ('local-game.tar.gz', 'provenance.json'):
            matches = [a for a in release.get('assets', []) if a.get('name') == name and a.get('state') == 'uploaded']
            if len(matches) != 1 or type(matches[0].get('id')) is not int:
                raise WaitingForBuild('Private release assets not complete')
            selected[name] = matches[0]
        return selected

    def download_asset(self, asset, limit):
        if type(asset.get('size')) is not int or not 0 < asset['size'] <= limit:
            raise ValueError('Private release asset exceeds size limit')
        raw = request('/repos/' + REPO + '/releases/assets/%s' % asset['id'], self.token, limit, asset=True)
        if len(raw) != asset['size']:
            raise ValueError('Private release asset size mismatch')
        return raw

    def require_publication(self, payload):
        run = self.repo('actions/runs/%s/attempts/%s' % (payload['runId'], payload['runAttempt']))
        require_repository(run.get('repository', {}))
        if (run.get('id') != payload['runId'] or run.get('run_attempt') != payload['runAttempt']
                or run.get('path') != PUBLISH or run.get('head_sha') != payload['commit']
                or run.get('head_branch') != 'main' or run.get('event') != payload['event']):
            raise ValueError('Private publication workflow identity mismatch')
        if run.get('status') != 'completed':
            raise WaitingForBuild('Signed publication workflow still running')
        if run.get('conclusion') != 'success':
            raise ValueError('Signed publication workflow did not succeed')


def verify_signature(package, envelope, sha, public_key, authorization):
    """Verify bytes with the installed Ed25519 key, never a downloaded key."""
    try:
        value = json.loads(envelope.read_bytes())
        if value.get('schemaVersion') != 2 or set(value) != {'schemaVersion', 'payload', 'signature'}:
            raise ValueError('Unsupported signature envelope')
        payload = base64.b64decode(value['payload'], validate=True)
        signature = base64.b64decode(value['signature'], validate=True)
        if len(payload) > 16384 or len(signature) != 64:
            raise ValueError('Invalid signature size')
        with tempfile.TemporaryDirectory(prefix='verify-', dir=package.parent) as folder:
            folder = Path(folder)
            (folder/'key.pem').write_bytes(protected(public_key))
            (folder/'payload').write_bytes(payload); (folder/'signature').write_bytes(signature)
            result = subprocess.run(['/usr/bin/openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(folder/'key.pem'),
                                     '-rawin', '-in', str(folder/'payload'), '-sigfile', str(folder/'signature')],
                                    capture_output=True, timeout=10)
        if result.returncode:
            raise ValueError('Invalid package signature')
        data = json.loads(payload)
        expected = {'repository': REPO, 'repositoryId': REPOSITORY_ID, 'workflow': PUBLISH,
                    'ref': 'refs/heads/main', 'commit': sha, 'runnerEnvironment': 'github-hosted',
                    'packageSha256': hashlib.sha256(package.read_bytes()).hexdigest(), 'authorization': authorization}
        if (any(data.get(k) != v for k, v in expected.items())
                or data.get('event') not in ('push', 'workflow_dispatch')
                or any(type(data.get(k)) is not int or data[k] <= 0 for k in ('runId', 'runAttempt'))):
            raise ValueError('Signed package identity mismatch')
        return data
    except (KeyError, TypeError, UnicodeError, json.JSONDecodeError, base64.binascii.Error):
        raise ValueError('Invalid package signature envelope') from None
