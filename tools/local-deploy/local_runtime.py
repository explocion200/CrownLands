"""Trusted local-only publication policy and static variant preparation."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

APP = Path('/usr/local/lib/crownlands-runtime/app')
NODE = Path('/usr/local/lib/crownlands-runtime/node')
HELPER = Path('/usr/local/lib/crownlands-deploy/prepare_production_client.js')
CONTROL = Path('/etc/crownlands-runtime/activation.json')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def runtime_hash(root):
    """All local adapter source and dependency locks; never node_modules."""
    directory = root / 'local-backend'
    if not directory.exists():
        return None  # Old Firebase-only packages remain valid only in old mode.
    entries = []
    for folder, directories, files in os.walk(directory, followlinks=False):
        directories[:] = sorted(d for d in directories if d != 'node_modules')
        for name in directories + files:
            file = Path(folder) / name
            if file.is_symlink() or name.startswith('.'):
                raise ValueError('Unexpected runtime source entry')
        for name in sorted(files):
            file = Path(folder) / name
            if not file.is_file():
                raise ValueError('Unexpected runtime source type')
            entries.append([file.relative_to(root).as_posix(), digest(file.read_bytes())])
    if not entries:
        raise ValueError('Local runtime source is empty')
    return digest(json.dumps(sorted(entries), separators=(',', ':')).encode())


def protected(file, maximum=65536):
    with os.fdopen(os.open(file, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > maximum:
            raise ValueError('Protected publisher input required')
        return handle.read()


def configuration(value):
    if (not isinstance(value, dict) or set(value) != {'mode','protocol','epoch','publicKey','runtimeHash','helperHash','nodeHash'}
            or value['mode'] != 'production' or value['protocol'] != 1
            or not re.fullmatch(r'[a-f0-9]{32}', value.get('epoch', ''))
            or not re.fullmatch(r'[A-Za-z0-9_-]{87}', value.get('publicKey', ''))
            or any(not re.fullmatch(r'[a-f0-9]{64}', value.get(k, '')) for k in ['runtimeHash','helperHash','nodeHash'])):
        raise ValueError('Reviewed local publication configuration required')
    return {k:value[k] for k in ['mode','protocol','epoch','publicKey']}


def authority(config):
    local = config.get('localBackend')
    if not CONTROL.exists():
        if local:
            raise ValueError('Local authority control missing')
        return None
    control = json.loads(protected(CONTROL, 1024))
    if (set(control) != {'version','phase','epoch'} or control.get('version') != 1
            or not re.fullmatch(r'[a-f0-9]{32}', control.get('epoch', ''))):
        raise ValueError('Invalid installed authority')
    if not local:
        if control.get('phase') != 'standby':
            raise ValueError('Firebase publication refused after local transfer began')
        return None
    configuration(local)
    if control != {'version':1, 'phase':'active', 'epoch':local['epoch']}:
        raise ValueError('Active matching local authority required for publication')
    if (config.get('approved',{}).get('localRuntimeHash') != local['runtimeHash']
            or runtime_hash(APP) != local['runtimeHash']
            or digest(protected(HELPER, 65536)) != local['helperHash']
            or digest(protected(NODE, 200*1024*1024)) != local['nodeHash']):
        raise ValueError('Installed local publication runtime changed')
    return local


def inventory(directory):
    result = {}
    for file in sorted(directory.rglob('*')):
        if file.is_symlink() or not (file.is_file() or file.is_dir()):
            raise ValueError('Static candidate contains an unexpected file type')
        if file.is_file():
            raw = file.read_bytes()
            result[file.relative_to(directory).as_posix()] = {'bytes':len(raw), 'sha256':digest(raw)}
    return result


def artifact_manifest(directory):
    files = inventory(directory)
    files.pop('artifact-manifest.json', None)
    value = {'schemaVersion':1, 'fileCount':len(files), 'totalBytes':sum(f['bytes'] for f in files.values()),
             'files':[{'path':p, 'bytes':f['bytes']} for p,f in files.items()]}
    (directory/'artifact-manifest.json').write_text(json.dumps(value,indent=2)+'\n')


def transform(staged, meta, local):
    public = configuration(local)
    if meta.get('localRuntimeHash') != local['runtimeHash']:
        raise ValueError('Package local runtime differs from installed runtime')
    source, destination = staged/'game', staged/'local-game'
    if inventory(source) != meta['files']:
        raise ValueError('Verified source package changed before local preparation')
    (staged/'signed-deployment.json').write_text(json.dumps(meta,indent=2)+'\n')
    # pack.py appends public deployment identity after the normal build. Include
    # it in the input inventory before invoking the installed static-only helper.
    artifact_manifest(source)
    config_file = staged/'public-local-config.json'
    config_file.write_text(json.dumps(public))
    if digest(protected(HELPER)) != local['helperHash'] or digest(protected(NODE,200*1024*1024)) != local['nodeHash']:
        raise ValueError('Trusted local preparation program changed')
    result = subprocess.run([str(NODE), str(HELPER), str(source), str(config_file), str(destination)],
                            capture_output=True, timeout=120, env={'PATH':'/usr/bin:/bin','HOME':str(staged)})
    if result.returncode:
        raise ValueError('Local static preparation failed; downloaded code was not executed')
    receipt = json.loads((staged/'local-game.receipt.json').read_text())
    expected = {entry['path']:{'bytes':entry['bytes'],'sha256':entry['sha256']} for entry in receipt['files']}
    if inventory(destination) != expected or any(receipt.get(k) != v for k,v in public.items()):
        raise ValueError('Local static preparation inventory differs')
    build = meta['commit']+'-local-'+local['epoch']
    if receipt.get('buildId') != build:
        raise ValueError('Local build identity mismatch')
    identity = {'schemaVersion':1,'commit':meta['commit'],'repository':meta['repository'],'channel':meta['channel'],
                'backend':'postgres-local','epoch':local['epoch'],'protocol':local['protocol'],'buildId':build}
    (destination/'local-deployment.json').write_text(json.dumps(identity,indent=2)+'\n')
    artifact_manifest(destination)
    source.rename(staged/'signed-game')
    destination.rename(source)
    for file in source.rglob('*'):
        file.chmod(0o755 if file.is_dir() else 0o644)
    source.chmod(0o755)
    converted = {**meta, 'backendMode':'postgres-local','localConfiguration':public,'buildId':build,
                 'files':inventory(source)}
    (staged/'deployment.json').write_text(json.dumps(converted,indent=2)+'\n')
    return converted


def require_local_release(release, local, approved):
    """A publisher rollback must never restore an old Firebase client."""
    meta = json.loads((release/'deployment.json').read_text())
    if (meta.get('backendMode') != 'postgres-local' or meta.get('localConfiguration') != configuration(local)
            or meta.get('localRuntimeHash') != local['runtimeHash'] or meta.get('backend') != approved.get('backend')):
        raise ValueError('Automatic rollback across backend authorities is forbidden')
    for name in ['firebase-config.js','service-worker.js','local-deployment.json','play/index.html']:
        if digest((release/'game'/name).read_bytes()) != meta['files'][name]['sha256']:
            raise ValueError('Previous local client identity changed')
