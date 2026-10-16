#!/usr/bin/env python3
"""Copy a verified, restored staging snapshot into empty permanent targets.

No authority activation, provider delivery, event replay or schedule startup.
The protected maintenance gate remains closed and source rollback remains a
separate operator procedure. Existing target data is never replaced.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import pwd
import re

import export_snapshot as snapshot
import transfer_maintenance as maintenance

GAME, AUTH = 'migration_game_live', 'migration_auth_live'


def import_sql(epoch, schema, manifest, verification_hash):
    if (not re.fullmatch(r'migration_final_[a-f0-9]{12}', schema)
            or not re.fullmatch(r'[a-f0-9]{64}', verification_hash)
            or not re.fullmatch(r'[a-f0-9]{64}', manifest.get('manifestSha256',''))
            or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:00Z',manifest.get('readTime',''))
            or type(manifest.get('expectedDocuments')) is not int or not 1<=manifest['expectedDocuments']<=snapshot.MAX_DOCUMENTS
            or type(manifest.get('authAccounts')) is not int or not 1<=manifest['authAccounts']<=100000):
        raise ValueError('Reviewed final staging identity and receipt required')
    before = schema+'_before_restore'
    # Reuse the tested exclusive authority/empty-target guard. Keep its
    # transaction open until both copies and every comparison have succeeded.
    guard = maintenance.database_sql(epoch,empty=True)
    guard = guard[:guard.index('SELECT row_to_json')]
    result = guard+"SET LOCAL statement_timeout='20min';\n"
    result += f"LOCK TABLE {schema}.documents,{schema}.accounts,{schema}.receipt,{before}.documents,{before}.accounts,{before}.receipt IN SHARE MODE;\n"
    result += f"""DO $verify$ DECLARE r jsonb; BEGIN
      IF (SELECT phase FROM crownlands_control.deployment WHERE singleton) <> 'maintenance' THEN
        RAISE EXCEPTION 'Maintenance required'; END IF;
      IF (SELECT count(*) FROM {schema}.receipt) <> 1 THEN RAISE EXCEPTION 'Unique staging receipt required'; END IF;
      SELECT body INTO STRICT r FROM {schema}.receipt;
      IF r->>'sourceProject' <> '{snapshot.PROJECT}' OR r->>'readTime' <> '{manifest['readTime']}'
        OR r->>'snapshotManifestSha256' IS DISTINCT FROM '{manifest['manifestSha256']}'
        OR (r->>'documents')::bigint <> {manifest['expectedDocuments']}
        OR (r->>'accounts')::bigint <> {manifest['authAccounts']}
        OR (SELECT count(*) FROM {schema}.documents) <> {manifest['expectedDocuments']}
        OR (SELECT count(*) FROM {schema}.accounts) <> {manifest['authAccounts']} THEN
        RAISE EXCEPTION 'Verified snapshot and staging differ'; END IF;
      IF EXISTS(SELECT 1 FROM {schema}.accounts WHERE body->>'localId' IS DISTINCT FROM uid) THEN
        RAISE EXCEPTION 'Account identity mismatch'; END IF;
      IF NOT EXISTS(SELECT 1 FROM {schema}.documents WHERE path='realmConfig/current'
         AND body#>>'{{fields,worldId,stringValue}}'=r#>>'{{realm,worldId}}'
         AND body#>>'{{fields,resetGeneration,stringValue}}'=r#>>'{{realm,resetGeneration}}'
         AND body#>>'{{fields,sharedRealmId,stringValue}}'=r#>>'{{realm,sharedRealmId}}') THEN
        RAISE EXCEPTION 'Current realm mismatch'; END IF;
    END $verify$;\n"""
    for table in ['documents','accounts','receipt']:
        result += f"""DO $compare$ BEGIN IF EXISTS(
          (SELECT * FROM {schema}.{table} EXCEPT ALL SELECT * FROM {before}.{table}) UNION ALL
          (SELECT * FROM {before}.{table} EXCEPT ALL SELECT * FROM {schema}.{table})) THEN
          RAISE EXCEPTION 'Independent staging restore differs'; END IF; END $compare$;\n"""
    result += f"""INSERT INTO {GAME}.documents(path,collection_id,parent_path,body,source_sha256)
      SELECT path,collection_id,parent_path,body,source_sha256 FROM {schema}.documents;
      INSERT INTO {AUTH}.accounts(uid,body) SELECT uid,body FROM {schema}.accounts;\n"""
    for table,target in [('documents',GAME),('accounts',AUTH)]:
        result += f"""DO $copy$ BEGIN IF EXISTS(
          (SELECT * FROM {schema}.{table} EXCEPT ALL SELECT * FROM {target}.{table}) UNION ALL
          (SELECT * FROM {target}.{table} EXCEPT ALL SELECT * FROM {schema}.{table})) THEN
          RAISE EXCEPTION 'Permanent copy differs'; END IF; END $copy$;\n"""
    result += f"""UPDATE crownlands_control.deployment SET snapshot_receipt='{verification_hash}' WHERE singleton;
      SELECT json_build_object('documents',(SELECT count(*) FROM {GAME}.documents),
        'accounts',(SELECT count(*) FROM {AUTH}.accounts),'phase',phase,'epoch',epoch,
        'snapshotReceipt',snapshot_receipt,'activatedAt',activated_at) FROM crownlands_control.deployment WHERE singleton;
      COMMIT;\n"""
    return result


def inputs(directory, verification, schema, epoch, owner):
    raw = maintenance.read_file(directory/'manifest.json',uid=owner,maximum=4*1024*1024)
    manifest = json.loads(raw)
    proof_raw = maintenance.read_file(verification/'receipt.json',uid=owner)
    proof = json.loads(proof_raw)
    if (manifest.get('project')!=snapshot.PROJECT or manifest.get('schemaVersion')!=1
        or manifest.get('firestoreComplete') is not True or manifest.get('authComplete') is not True
        or manifest.get('expectedDocuments')!=manifest.get('exportedDocuments')
        or proof.get('exactSnapshotVerified') is not True or proof.get('epoch')!=epoch
        or proof.get('snapshotManifestSha256')!=snapshot.checksum(raw)
        or proof.get('documents')!=manifest['expectedDocuments'] or proof.get('accounts')!=manifest['authAccounts']):
        raise ValueError('Matching verified final snapshot required')
    snapshot.verify_files(directory,manifest)
    restored = json.loads(maintenance.read_file(directory/(schema+'-restore.json'),uid=owner))
    if restored.get('schema')!=schema or restored.get('restoreVerified') is not True or restored.get('originalPreservedAs')!=schema+'_before_restore':
        raise ValueError('Completed independent staging restore required')
    auth_config = json.loads(maintenance.read_file(directory/'auth-config.json',uid=owner))
    google = json.loads(maintenance.read_file(directory/'google-oauth.json',uid=owner))
    installed = maintenance.read_json(Path('/etc/crownlands-runtime/auth.json'))
    if auth_config.get('signIn',{}).get('hashConfig')!=installed.get('hashConfig') or google!=installed.get('google'):
        raise ValueError('Fresh sign-in settings differ from the tested installed service')
    return {**manifest,'manifestSha256':snapshot.checksum(raw)}, proof, snapshot.checksum(proof_raw)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('verification',type=Path)
    parser.add_argument('--schema',required=True)
    args=parser.parse_args()
    if os.geteuid()!=0:
        raise ValueError('Ubuntu administrator authentication required')
    owner=pwd.getpwnam('project-server')
    base=Path(owner.pw_dir)/'.local/share/crownlands'
    for folder in [args.directory,args.verification]:
        if (not folder.is_absolute() or folder.is_symlink() or not folder.resolve().is_relative_to(base.resolve())
                or folder.stat().st_uid!=owner.pw_uid or folder.stat().st_mode&0o077):
            raise ValueError('Private operator-owned transfer folders required')
    if not re.fullmatch(r'migration_final_[a-f0-9]{12}',args.schema):
        raise ValueError('Unique final staging schema required')
    host=maintenance.Host()
    with os.fdopen(os.open('/var/lib/crownlands-transfer/import.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600),'wb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        status=maintenance.Maintenance(host).check()
        manifest,proof,checksum=inputs(args.directory,args.verification,args.schema,host.config['epoch'],owner.pw_uid)
        session=host.session()
        if session.get('planSha256')!=proof.get('planSha256'):
            raise ValueError('Snapshot was verified under a different transfer plan')
        output=maintenance.run(['runuser','-u','postgres','--','psql','-X','-qAt','-h','/var/run/postgresql','-d','crownlands_migration','-v','ON_ERROR_STOP=1'],
            import_sql(host.config['epoch'],args.schema,manifest,checksum),timeout=1500)
        result=json.loads(output.splitlines()[-1])
        maintenance.Maintenance(host).check()
        receipt={'version':1,'schema':args.schema,'snapshotManifestSha256':manifest['manifestSha256'],
                 'verificationSha256':checksum,**result,'importedAt':datetime.now(timezone.utc).isoformat(),
                 'localAuthorityActivated':False}
        maintenance.atomic(Path('/var/lib/crownlands-transfer/import.json'),maintenance.encode(receipt))
        print(json.dumps({k:receipt[k] for k in ['documents','accounts','phase','localAuthorityActivated']}))


if __name__=='__main__':
    try:main()
    except Exception:
        raise SystemExit('Final import stopped; original snapshots and existing database rows were preserved. Inspect private evidence before retrying; authority was not activated.') from None
