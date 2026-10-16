#!/usr/bin/python3
"""Read-only final source checks, after exact snapshot comparison and drain.

This command cannot freeze Firebase or activate PostgreSQL. Its report is bound
to the maintenance plan and exact snapshot. It complements, rather than replaces,
the later protected import, restore and activation checks.
"""
import argparse
import fcntl
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

import export_snapshot as snapshot
import prepare_firebase_freeze as freeze
import firebase_transfer_controls as controls
import verify_final_snapshot as final
import handover_checks as handover


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def request(url,headers,limit=4*1024*1024):
    try:
        response=urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers),timeout=45)
    except urllib.error.HTTPError as error:
        response=error
    with response:
        raw=response.read(limit+1)
        if len(raw)>limit:raise ValueError('Handover response exceeded its limit')
        return response.code,raw


def public_probes(key,identity_token):
    # Read-only archived rankings have no runtime cache; this endpoint returned
    # a valid ranking before closure. Public invoker denial and authenticated
    # runtime database denial are independent checks.
    url='https://getpublicseasonrankings-h6zgtnbrua-uc.a.run.app?season=realm-2026-09&board=players'
    public,_=request(url,{'Cache-Control':'no-cache'})
    runtime,body=request(url,{'Cache-Control':'no-cache','X-Serverless-Authorization':'Bearer '+identity_token})
    account,account_body=request('https://identitytoolkit.googleapis.com/v1/projects?key='+urllib.parse.quote(key,safe=''),
        {'Origin':'https://playcrownlands.com','Referer':'https://playcrownlands.com/'})
    details=json.loads(account_body).get('error',{}).get('details',[])
    blocked=any(d.get('reason')=='API_KEY_SERVICE_BLOCKED' and d.get('metadata',{}).get('service')=='identitytoolkit.googleapis.com' for d in details)
    expected={'error':'Season rankings are temporarily unavailable.'}
    if public!=403 or runtime!=503 or json.loads(body)!=expected or account!=403 or not blocked:
        raise ValueError('Actual account, public invocation or runtime denial is not verified')
    return {'publicInvocationStatus':public,'runtimeReadStatus':runtime,'runtimeReadError':expected['error'],
        'accountReadStatus':account,'accountReason':'API_KEY_SERVICE_BLOCKED','accountService':'identitytoolkit.googleapis.com'}


def api_read(url,token):
    if urllib.parse.urlsplit(url).hostname not in ['pubsub.googleapis.com','monitoring.googleapis.com']:
        raise ValueError('Unapproved handover metadata API')
    code,body=request(url,{'Authorization':'Bearer '+token,'x-goog-user-project':freeze.PROJECT},16*1024*1024)
    if code!=200:raise ValueError('Handover metadata read failed')
    return json.loads(body)


def evaluate_rules(source,cases,token):
    # This is Google's rules evaluator, not a document write or rule deployment.
    url='https://firebaserules.googleapis.com/v1/projects/'+freeze.PROJECT+':test'
    req=urllib.request.Request(url,data=snapshot.encode({'source':source,'testSuite':{'testCases':cases}}),
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','x-goog-user-project':freeze.PROJECT})
    with urllib.request.build_opener(NoRedirect).open(req,timeout=45) as response:
        raw=response.read(4*1024*1024+1)
    if len(raw)>4*1024*1024:raise ValueError('Rules evaluation exceeded its limit')
    return json.loads(raw)


def published_client_lock(api,plan,journal):
    # Existing game sessions may already be closed. Do not reopen authentication
    # or invent an observed browser denial. Fetch the actual published deny-all
    # rules before/after evaluating synthetic client contexts with Google, after
    # the documented maximum ten-minute listener propagation window.
    closed=handover.stamp(journal['closedAt'])
    if datetime.now(timezone.utc).timestamp()-closed<600:raise ValueError('Client rule propagation window incomplete')
    url='https://firebaserules.googleapis.com/v1/projects/'+freeze.PROJECT+'/releases/cloud.firestore'
    release=api.read(url)
    if release.get('rulesetName')!=journal.get('rulesetCreated'):raise ValueError('Published client rules changed')
    rules=api.read('https://firebaserules.googleapis.com/v1/'+release['rulesetName'])
    expected={'files':[{'name':'firestore.rules','content':freeze.DENY_RULES}]}
    if rules.get('source')!=expected or plan.get('rulesetBlocked',{}).get('source')!=expected:
        raise ValueError('Only the exact unconditional client lock may be evaluated')
    cases=[]
    for auth in [None,{'uid':'migration-lock-test','token':{}},
                 {'uid':'migration-lock-test','token':{'email_verified':True,'admin':True}}]:
        for path in ['players/migration-lock-test','worlds/migration-lock-test/cities/probe']:
            for method in ['get','list','create','update','delete']:
                cases.append({'expectation':'DENY','request':{'path':'/databases/(default)/documents/'+path,
                    'method':method,**({'auth':auth} if auth else {})},'resource':{'data':{}}})
    result=evaluate_rules(expected,cases,api.reader.token)
    results=result.get('testResults',[])
    if (result.get('issues') or len(results)!=len(cases) or any(x.get('state')!='SUCCESS'
            or not x.get('visitedExpressions') or any(e.get('value') is not False for e in x['visitedExpressions']) for x in results)):
        raise ValueError('Google did not verify every unconditional client denial')
    if api.read(url)!=release:raise ValueError('Client rules changed during evaluation')
    return {'method':'published-rules-evaluation','recordedAt':datetime.now(timezone.utc).isoformat(),
        'ruleset':release['rulesetName'],'sourceSha256':snapshot.checksum(snapshot.encode(expected)),
        'cases':cases,'result':result,'allDenied':True,'authenticatedCases':20,
        'browserSessionUsed':False,'propagationWaitSeconds':int(datetime.now(timezone.utc).timestamp()-closed)}


def scheduler_execution_logs(planned_jobs):
    through=datetime.now(timezone.utc).isoformat()
    def read(job):
        start=(datetime.fromisoformat(job['lastAttemptTime'].replace('Z','+00:00'))-timedelta(seconds=600)).isoformat()
        query=('logName="projects/'+freeze.PROJECT+'/logs/cloudscheduler.googleapis.com%2Fexecutions"'
            +' AND resource.type="cloud_scheduler_job" AND resource.labels.project_id='+json.dumps(freeze.PROJECT)
            +' AND resource.labels.location="us-central1" AND resource.labels.job_id='+json.dumps(job['name'].split('/')[-1])
            +' AND timestamp>='+json.dumps(start)+' AND timestamp<='+json.dumps(through))
        result=subprocess.run(['gcloud','logging','read',query,'--project='+freeze.PROJECT,
            '--order=asc','--limit=1000','--format=json'],capture_output=True,text=True,timeout=90)
        if result.returncode or len(result.stdout)>16*1024*1024:raise ValueError('Scheduler execution log read failed')
        entries=json.loads(result.stdout)
        if not isinstance(entries,list) or len(entries)>=1000:raise ValueError('Scheduler execution history incomplete')
        return job['name'],{'from':start,'through':through,'entries':entries}
    with ThreadPoolExecutor(max_workers=4) as executor:
        return dict(executor.map(read,planned_jobs))


def collect(plan_directory,snapshot_directory,verification_directory,baseline_directory,payments_file,output):
    if output.exists():raise ValueError('Preserve previous handover evidence')
    plan=json.loads((plan_directory/'freeze-plan.json').read_text())
    journal=json.loads((plan_directory/'controls-journal.json').read_text())
    guard=lambda:controls.local_guard(plan)
    api=controls.API()
    final.verify_controls(plan,journal,api,guard)
    proof_raw=(verification_directory/'receipt.json').read_bytes();proof=json.loads(proof_raw)
    manifest_raw=(snapshot_directory/'manifest.json').read_bytes();manifest=json.loads(manifest_raw)
    if (proof.get('exactSnapshotVerified') is not True or proof.get('planSha256')!=freeze.digest(plan)
            or proof.get('snapshotManifestSha256')!=snapshot.checksum(manifest_raw)
            or proof.get('epoch')!=plan['epoch'] or proof.get('documents')!=manifest.get('expectedDocuments')):
        raise ValueError('Matching final comparison required')
    snapshot.verify_files(snapshot_directory,manifest)
    baseline=json.loads((baseline_directory/'baseline.json').read_text())
    if (baseline.get('runtimeStatus')!=200 or baseline.get('accountStatus')!=200
            or baseline.get('epoch')!=plan['epoch'] or handover.stamp(baseline['recordedAt'])>=handover.stamp(journal['closedAt'])):
        raise ValueError('Pre-closure read-only access baseline required')
    client_lock=published_client_lock(api,plan,journal)
    def documents():
        for page in manifest['pages']:
            yield from json.loads((snapshot_directory/page['file']).read_text())
    # The pointer is read from the same immutable exported snapshot, never from
    # a release default or an operator-supplied previous generation.
    realm=None
    for doc in documents():
        if doc['name']==handover.ROOT+'realmConfig/current':
            realm={key:handover.scalar(doc.get('fields',{}),key) for key in ['worldId','resetGeneration','sharedRealmId']};break
    inventory=handover.inspect_documents(documents(),realm or {})
    handover.require_drained_inventory(inventory)
    if inventory['documents']!=proof['documents']:raise ValueError('Incomplete audited source snapshot')
    # A separate read-only Stripe verifier records checked order contents and
    # provider outcomes. It must inspect this exact final snapshot, not an old
    # preflight list or a copied test-world wallet.
    payments=json.loads(payments_file.read_text())
    if (payments.get('snapshotManifestSha256')!=snapshot.checksum(manifest_raw)
            or payments.get('orders')!=len(inventory['orders']) or payments.get('unsettled')!=0
            or payments.get('endpointsVerified')!=['live','test']
            or not 0<=datetime.now(timezone.utc).timestamp()-handover.stamp(payments['recordedAt'])<=300):
        raise ValueError('Fresh final-snapshot provider reconciliation required')
    routes=json.loads((baseline_directory/'local-schedules.json').read_text())
    jobs=freeze.listed(api.read,'https://cloudscheduler.googleapis.com/v1/projects/'+freeze.PROJECT+'/locations/us-central1/jobs?pageSize=500','jobs')
    executions=scheduler_execution_logs(plan['jobsBefore'])
    cursors=handover.scheduler_cursors(jobs,routes,journal['closedAt'],datetime.now(timezone.utc).isoformat(),plan['jobsBefore'],executions)
    subscriptions=freeze.listed(lambda url:api_read(url,api.reader.token),
        'https://pubsub.googleapis.com/v1/projects/'+freeze.PROJECT+'/subscriptions?pageSize=1000','subscriptions')
    expected=json.loads((baseline_directory/'event-subscriptions.json').read_text())
    if sorted(subscriptions,key=lambda v:v['name'])!=sorted(expected,key=lambda v:v['name']):
        raise ValueError('Event subscription configuration changed')
    names=[s['name'].split('/')[-1] for s in expected]
    now=datetime.now(timezone.utc)
    query=urllib.parse.urlencode({'filter':'metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages" AND resource.type="pubsub_subscription"',
        'interval.startTime':(now-timedelta(minutes=5)).isoformat(),'interval.endTime':now.isoformat(),'view':'FULL','pageSize':1000})
    metrics=api_read('https://monitoring.googleapis.com/v3/projects/'+freeze.PROJECT+'/timeSeries?'+query,api.reader.token)
    if metrics.get('nextPageToken'):raise ValueError('Unreviewed metrics pagination')
    queues=handover.require_empty_subscriptions(metrics.get('timeSeries',[]),names,journal['controlsAppliedAt'],now.isoformat())
    source=Path('/srv/crownlands/current/game/firebase-config.js').read_text()
    key=re.search(r'apiKey\s*:\s*[\"\x27]([^\"\x27]+)',source)
    if not key:raise ValueError('Existing Firebase client key unavailable')
    token=subprocess.run(['gcloud','auth','print-identity-token'],capture_output=True,text=True,check=True).stdout.strip()
    probes=public_probes(key[1],token)
    final.verify_controls(plan,journal,controls.API(),guard)
    guard()
    output=snapshot.private_directory(output)
    report={'version':1,'project':freeze.PROJECT,'epoch':plan['epoch'],'planSha256':freeze.digest(plan),
        'snapshotManifestSha256':snapshot.checksum(manifest_raw),'verificationSha256':snapshot.checksum(proof_raw),
        'recordedAt':datetime.now(timezone.utc).isoformat(),'sourceFrozen':True,'localAuthorityActivated':False,
        'documents':inventory['documents'],'realm':inventory['realm'],'pending':inventory['pending'],
        'schedulerExecutionEvidenceSha256':snapshot.checksum(snapshot.encode(executions)),
        'payments':{'orders':payments['orders'],'unsettled':0},'queues':queues,'probes':probes,'schedulers':cursors,
        'clientLock':{'method':client_lock['method'],'allDenied':client_lock['allDenied'],
            'authenticatedCases':client_lock['authenticatedCases'],'browserSessionUsed':False,
            'evidenceSha256':snapshot.checksum(snapshot.encode(client_lock))}}
    for name,value in [('scheduler-observations.json',jobs),('scheduler-executions.json',executions),('event-metrics.json',metrics),
                       ('client-rules-evaluation.json',client_lock),('receipt.json',report)]:
        if (output/name).exists():raise ValueError('Previous handover evidence preserved')
        snapshot.atomic_private(output/name,snapshot.encode(value))
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['plan_directory','snapshot_directory','verification_directory','baseline_directory','payments_file','output']:p.add_argument(name,type=Path)
    args=p.parse_args();private_root=Path.home()/'.local/share/crownlands'
    for path in vars(args).values():
        if not path.is_absolute() or path.is_symlink() or not path.resolve().is_relative_to(private_root.resolve()):raise ValueError('Private Crownlands evidence paths required')
    with os.fdopen(os.open(args.plan_directory/'controls.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600),'wb') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        report=collect(**vars(args))
    print(json.dumps({key:report[key] for key in ['sourceFrozen','localAuthorityActivated','documents','pending','payments','queues']}))


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Source handover verification stopped; no source, database or routing changes were made. Private evidence was preserved.') from None
