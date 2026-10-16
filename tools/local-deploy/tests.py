import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import os
import shutil
import subprocess
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


p = load("publisher")
pack = load("pack")
local = load("local_runtime")
COMMIT = "a" * 40
APPROVED = {"backend": {"serverSourceHash": "b" * 64, "contractHash": "c" * 64,
                       "releaseId": "live", "worldId": "world", "resetGeneration": "current"},
            "firebaseConfigHash": p.digest(b"config"), "firebaseDeploymentHash": p.digest(b"{}")}


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.host = self.root / "host"
        self.state = self.root / "state"
        self.state.mkdir()
        self.previous = self.host / "releases" / "previous"
        (self.previous / "website").mkdir(parents=True)
        (self.previous / "website/index.html").write_text("homepage")
        (self.host / "current").symlink_to("releases/previous")
        self.stage = self.host / "releases" / ".stage"
        self.stage.mkdir()
        self.package = self.root / "package.tar.gz"

    def archive(self, edit=None):
        files = {name: b"fixture" for name in ["index.html", "release-manifest.js",
                 "manifest.webmanifest", "app-entry.js", "firebaseClient.js"]}
        files.update({"play/index.html": COMMIT.encode(), "firebase-config.js": b"config",
                      "service-worker.js": ('const CACHE_VERSION = "' + COMMIT + '";').encode(),
                      "local-deployment.json": json.dumps({"commit": COMMIT}).encode()})
        meta = {"schemaVersion": 1, "repository": p.REPO, "channel": "local-live",
                "commit": COMMIT, **APPROVED,
                "files": {n: {"bytes": len(v), "sha256": p.digest(v)} for n, v in files.items()}}
        entries = [("game/" + n, data, tarfile.REGTYPE) for n, data in files.items()]
        if edit:
            edit(meta, entries)
        with tarfile.open(self.package, "w:gz") as tar:
            data = json.dumps(meta).encode()
            for name, data, kind in [("deployment.json", data, tarfile.REGTYPE)] + entries:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
                info.size = len(data) if kind == tarfile.REGTYPE else 0
                tar.addfile(info, io.BytesIO(data) if info.size else None)
        return meta

    def unpack(self):
        return p.unpack(self.package, self.stage, COMMIT, APPROVED)

    def test_valid_package_activates_and_preserves_website(self):
        self.archive()
        meta = self.unpack()
        p.activate(self.host, self.state, self.stage, meta, lambda *_: None, lambda: COMMIT)
        active = p.current_release(self.host)
        self.assertEqual(active.name, "auto-" + COMMIT)
        self.assertEqual((active / "website/index.html").read_text(), "homepage")
        self.assertTrue(self.previous.exists())
        self.assertEqual(active.stat().st_mode & 0o777, 0o755)

    def test_health_failure_rolls_back_and_blocks_retry(self):
        self.archive()
        meta = self.unpack()
        def fail(*_):
            raise ValueError("unhealthy")
        with self.assertRaisesRegex(ValueError, "unhealthy"):
            p.activate(self.host, self.state, self.stage, meta, fail, lambda: COMMIT)
        self.assertEqual(p.current_release(self.host), self.previous)
        self.assertEqual(json.loads((self.state / "blocked.json").read_text())["commit"], COMMIT)

    def test_power_loss_rolls_back(self):
        candidate = self.host / "releases" / ("auto-" + COMMIT)
        candidate.mkdir()
        p.atomic_json(self.state / "transaction.json", {
            "previous": "previous", "candidate": candidate.name, "commit": COMMIT})
        p.swap(self.host / "current", candidate)
        p.recover(self.host, self.state)
        self.assertEqual(p.current_release(self.host), self.previous)
        self.assertTrue((self.state / "blocked.json").exists())

    def test_newer_commit_holds_stale_build(self):
        self.archive()
        with self.assertRaisesRegex(ValueError, "newer main"):
            p.activate(self.host, self.state, self.stage, self.unpack(), lambda *_: None, lambda: "d" * 40)
        self.assertEqual(p.current_release(self.host), self.previous)

    def test_backend_change_is_held(self):
        self.archive(lambda meta, _: meta.update(backend={}))
        with self.assertRaisesRegex(ValueError, "Backend change held"):
            self.unpack()
        self.assertEqual(p.current_release(self.host), self.previous)

    def test_traversal_rejected(self):
        self.archive(lambda _, entries: entries.append(("game/../../escape", b"bad", tarfile.REGTYPE)))
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.unpack()
        self.assertFalse((self.host / "escape").exists())

    def test_symlink_rejected(self):
        self.archive(lambda _, entries: entries.append(("game/link", b"", tarfile.SYMTYPE)))
        with self.assertRaisesRegex(ValueError, "regular"):
            self.unpack()

    def test_duplicate_missing_and_corrupt_files_rejected(self):
        for mode in ("duplicate", "missing", "corrupt"):
            with self.subTest(mode=mode):
                folder = self.root / mode
                folder.mkdir()
                def edit(_, entries):
                    if mode == "duplicate": entries.append(entries[0])
                    if mode == "missing": entries.pop()
                    if mode == "corrupt":
                        n, data, kind = entries[0]
                        entries[0] = (n, b"x" * len(data), kind)
                self.archive(edit)
                with self.assertRaises(ValueError):
                    p.unpack(self.package, folder, COMMIT, APPROVED)

    def test_wrong_commit_and_oversized_release_rejected(self):
        self.archive(lambda meta, _: meta.update(commit="d" * 40))
        with self.assertRaisesRegex(ValueError, "identity"):
            self.unpack()
        self.archive(lambda meta, _: meta["files"]["index.html"].update(bytes=p.MAX_CONTENT + 1))
        with self.assertRaisesRegex(ValueError, "size limit"):
            self.unpack()

    def test_live_smoke_detects_stale_service_worker(self):
        self.archive()
        meta = self.unpack()
        def fetch(url):
            if url.endswith("/service-worker.js"): return b"old worker"
            return (self.stage / "game/play/index.html").read_bytes()
        with self.assertRaisesRegex(ValueError, "service-worker"):
            p.smoke(self.host, meta, fetch)

    def test_signature_verification_enforces_all_trust_constraints(self):
        with patch.object(p.subprocess, "run") as run:
            run.return_value.returncode = 0
            p.verify_signature(self.package, self.root / "bundle.json", COMMIT, "/trusted/gh")
            args = run.call_args.args[0]
            for flag, value in (("--repo", p.REPO), ("--source-digest", COMMIT),
                                ("--source-ref", "refs/heads/main"), ("--signer-workflow", p.WORKFLOW)):
                self.assertEqual(args[args.index(flag) + 1], value)
            self.assertIn("--deny-self-hosted-runners", args)
            run.return_value.returncode = 1
            run.return_value.stderr = "bad signature"
            with self.assertRaisesRegex(ValueError, "signature"):
                p.verify_signature(self.package, self.root / "bundle.json", COMMIT, "/trusted/gh")

    def test_redirects_reject_credentials_and_untrusted_hosts(self):
        for url in ("http://github.com/file", "https://evil.example/file",
                    "https://github.com.evil.example/file", "https://user@github.com/file"):
            with self.assertRaises(ValueError): p.check_url(url)
        self.assertEqual(p.check_url("https://release-assets.githubusercontent.com/file"),
                         "https://release-assets.githubusercontent.com/file")

    def test_packaging_round_trip(self):
        self.archive()
        meta = self.unpack()
        source = self.root / "source"
        (source / "functions").mkdir(parents=True)
        (source / "firebase.json").write_bytes(b"{}")
        (source / "functions/release-manifest.json").write_text(
            json.dumps({**meta["backend"], "buildId": COMMIT}))
        (self.stage / "game").rename(source / "dist")
        package = self.root / "roundtrip.tar.gz"
        packed = pack.package(source, package, COMMIT)
        extracted = self.root / "roundtrip"
        extracted.mkdir()
        self.assertEqual(p.unpack(package, extracted, COMMIT, APPROVED)["files"], packed["files"])


class LocalPublicationTests(unittest.TestCase):
    archive = PublicationTests.archive
    unpack = PublicationTests.unpack

    def setUp(self):
        PublicationTests.setUp(self)
        self.repo=HERE.parents[1]
        self.node=Path(shutil.which('node')).resolve()
        self.helper=self.repo/'tools/local-migration/prepare_production_client.js'
        public=subprocess.check_output([str(self.node),'-e',"const e=require('node:crypto').createECDH('prime256v1');e.generateKeys();process.stdout.write(e.getPublicKey().toString('base64url'))"],text=True)
        self.local={'mode':'production','protocol':1,'epoch':'e'*32,'publicKey':public,
                    'runtimeHash':local.runtime_hash(self.repo),'helperHash':local.digest(self.helper.read_bytes()),'nodeHash':local.digest(self.node.read_bytes())}
        self.config={'localBackend':self.local,'approved':{**APPROVED,'localRuntimeHash':self.local['runtimeHash']}}

    def make_local(self):
        self.archive();meta=self.unpack();game=self.stage/'game'
        html=f'<meta name="crownlands-build" content="{COMMIT}"><script src="firebase-config.js"></script><script src="app-entry.js"></script>'
        for name in ['index.html','play/index.html']:(game/name).write_text(html)
        for name in ['local-production.js','local-client.js','local-web-push.js','firebaseClient.js','service-worker.js','firebase-config.js']:
            (game/name).write_bytes((self.repo/name).read_bytes())
        meta['localRuntimeHash']=self.local['runtimeHash'];meta['files']=local.inventory(game)
        def protected(file,maximum=65536):
            self.assertIn(file,[self.node,self.helper]);return file.read_bytes()
        with patch.object(local,'NODE',self.node),patch.object(local,'HELPER',self.helper),patch.object(local,'protected',side_effect=protected):
            return local.transform(self.stage,meta,self.local)

    def test_actual_trusted_transform_preserves_source_and_local_identity(self):
        meta=self.make_local()
        self.assertEqual(meta['files'],local.inventory(self.stage/'game'))
        self.assertIn('CROWNLANDS_LOCAL_BACKEND',(self.stage/'game/firebase-config.js').read_text())
        self.assertIn('CROWNLANDS_FIREBASE_CONFIG',(self.stage/'signed-game/firebase-config.js').read_text())
        self.assertIn('"'+COMMIT+'-local-'+self.local['epoch']+'"',(self.stage/'game/service-worker.js').read_text())
        local.require_local_release(self.stage,self.local,self.config['approved'])
        identity=json.loads((self.stage/'game/local-deployment.json').read_text())
        self.assertEqual(identity['backend'],'postgres-local');self.assertEqual(identity['epoch'],self.local['epoch'])
        self.assertTrue((self.stage/'signed-deployment.json').exists())

    def test_source_code_is_never_loaded_by_transform(self):
        # Browser input is only read as bytes, even when it would fail if executed.
        sentinel=self.root/'must-not-exist'
        with patch.object(local.subprocess,'run',wraps=subprocess.run) as run:
            self.make_local()
            call=run.call_args.args[0]
            self.assertEqual(call[:2],[str(self.node),str(self.helper)])
            self.assertFalse(any(str(self.stage/'game')==arg for arg in call[:2]))
        self.assertFalse(sentinel.exists())

    def test_wrong_runtime_hold_and_old_firebase_rollback_refused(self):
        self.archive(lambda meta,_:meta.update(localRuntimeHash='0'*64))
        with self.assertRaisesRegex(p.BackendHold,'Local backend'):
            p.unpack(self.package,self.stage,COMMIT,self.config['approved'])
        # A well-formed old static release is still the wrong authority.
        self.archive();meta=self.unpack()
        with self.assertRaisesRegex(ValueError,'across backend'):
            local.require_local_release(self.stage,self.local,self.config['approved'])

    def test_authority_requires_exact_epoch_phase_and_installed_programs(self):
        control={'version':1,'phase':'active','epoch':self.local['epoch']}
        def protected(file,maximum=65536):
            if file==local.CONTROL:return json.dumps(control).encode()
            return file.read_bytes()
        with patch.object(local,'APP',self.repo),patch.object(local,'NODE',self.node),patch.object(local,'HELPER',self.helper),patch.object(local,'protected',side_effect=protected),patch.object(Path,'exists',return_value=True):
            self.assertEqual(local.authority(self.config),self.local)
            with self.assertRaisesRegex(ValueError,'Firebase publication'):local.authority({'approved':APPROVED})
            control['phase']='maintenance'
            with self.assertRaisesRegex(ValueError,'Active matching'):local.authority(self.config)
            control['phase']='active';control['epoch']='a'*32
            with self.assertRaisesRegex(ValueError,'Active matching'):local.authority(self.config)
            control['epoch']=self.local['epoch'];self.config['localBackend']={**self.local,'helperHash':'0'*64}
            with self.assertRaisesRegex(ValueError,'runtime changed'):local.authority(self.config)

    def test_runtime_fingerprint_covers_changes_new_files_and_dependencies(self):
        root=self.root/'runtime';(root/'local-backend').mkdir(parents=True)
        f=root/'local-backend/adapter.js';f.write_text('one');before=local.runtime_hash(root)
        f.write_text('two');self.assertNotEqual(local.runtime_hash(root),before)
        f.write_text('one');(root/'local-backend/new.js').write_text('new');self.assertNotEqual(local.runtime_hash(root),before)
        (root/'local-backend/new.js').unlink();(root/'local-backend/node_modules').mkdir();(root/'local-backend/node_modules/private').write_text('ignored')
        self.assertEqual(local.runtime_hash(root),before)
        (root/'local-backend/pnpm-lock.yaml').write_text('dependencies');self.assertNotEqual(local.runtime_hash(root),before)
        (root/'local-backend/link').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError):local.runtime_hash(root)

    def test_local_recovery_refuses_firebase_without_switching(self):
        candidate=self.host/'releases'/('auto-'+COMMIT);candidate.mkdir()
        p.atomic_json(self.state/'transaction.json',{'previous':'previous','candidate':candidate.name,'commit':COMMIT})
        p.swap(self.host/'current',candidate)
        def reject(_):raise ValueError('cross authority')
        with self.assertRaisesRegex(ValueError,'cross authority'):p.recover(self.host,self.state,reject)
        self.assertEqual(p.current_release(self.host),candidate)
        self.assertTrue((self.state/'transaction.json').exists())

    def test_phase_change_before_symlink_switch_preserves_live_client(self):
        self.archive();meta=self.unpack();calls=0
        def authority():
            nonlocal calls
            calls+=1
            if calls==2:raise ValueError('authority changed')
        with self.assertRaisesRegex(ValueError,'authority changed'):
            p.activate(self.host,self.state,self.stage,meta,lambda *_:None,lambda:COMMIT,authority)
        self.assertEqual(p.current_release(self.host),self.previous)
        self.assertTrue((self.state/'transaction.json').exists())


if __name__ == "__main__":
    unittest.main()
