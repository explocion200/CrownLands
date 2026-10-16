"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {COMPONENTS,GAME,AUTH}=require('../../local-backend/deployment-policy');
const {copyRuntime}=require('./prepare_game_preview');const {hashes}=require('./prepare_auth_preview');
const ROOT='/usr/local/lib/crownlands-runtime';
function unit(role){const permanent=COMPONENTS.includes(role);const name='crownlands-'+role;
  const command=permanent?`permanent-services.js ${role}`:role==='payment-ingress'?'payment-ingress.js':'operations-http.js';
  return `[Unit]\nDescription=Crownlands ${role} permanent service\nAfter=network-online.target postgresql.service\nWants=network-online.target\nStartLimitIntervalSec=300\nStartLimitBurst=5\n\n[Service]\nUser=${name}\nGroup=${name}\nWorkingDirectory=${ROOT}/app\nExecStart=${ROOT}/node --max-old-space-size=1024 ${ROOT}/app/local-backend/${command}\n${role==='operations'?'':`LoadCredential=${permanent?'config':'secrets'}:/etc/crownlands-runtime/${role}.json\n`}StateDirectory=${name}\nStateDirectoryMode=${role==='operations'?'0755':'0700'}\nRestart=${permanent?'always':'on-failure'}\nRestartSec=10\nTimeoutStopSec=25\nUMask=0077\nNoNewPrivileges=yes\nPrivateTmp=yes\nPrivateDevices=yes\nProtectSystem=strict\nProtectHome=yes\nProtectKernelTunables=yes\nProtectKernelModules=yes\nProtectControlGroups=yes\nProtectKernelLogs=yes\nProtectClock=yes\nProtectHostname=yes\nProtectProc=invisible\nRestrictSUIDSGID=yes\n${role==='worker'?'PrivateNetwork=yes\nRestrictAddressFamilies=AF_UNIX':'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'}\nCapabilityBoundingSet=\nMemoryMax=${role==='game'||role==='worker'?'1536M':'512M'}\nTasksMax=80\n\n[Install]\nWantedBy=multi-user.target\n`;
}
function caddy(before){const marker='\t\thandle /backup-healthz {';if(before.split(marker).length!==2||before.includes('/api/payments/stripe/')||before.includes('/service-healthz/'))throw Error('Review existing routes');
 const snippet=`\t\t# Permanent service health and Stripe ingress. Game authority changes separately.\n\t\thandle /service-healthz/* {\n\t\t\treverse_proxy 127.0.0.1:9295\n\t\t}\n\t\thandle /api/payments/stripe/* {\n\t\t\trequest_body {\n\t\t\t\tmax_size 262144\n\t\t\t}\n\t\t\treverse_proxy 127.0.0.1:9294\n\t\t}\n`;
 return before.replace(marker,snippet+marker);}
async function prepare(bundle){const repo=path.resolve(__dirname,'../..'),root=path.join(require('node:os').homedir(),'.local/share/crownlands');
 if(process.versions.node.split('.')[0]!=='22'||!path.isAbsolute(bundle)||fs.existsSync(bundle)||execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim())throw Error('Clean committed Node 22 source and a new private directory required');
 const progress=JSON.parse(fs.readFileSync(path.join(root,'firebase-rehearsal-20261015/migration-progress.json')));
 const auth=JSON.parse(fs.readFileSync(path.join(progress.ownerSignInPreview.bundle,'config.json')));
 const push=JSON.parse(fs.readFileSync(path.join(progress.webPushRehearsal.bundle,'config.json')));
 const translation=JSON.parse(fs.readFileSync(path.join(progress.translationRehearsal.retryBundle,'translation.json'))).serviceAccount;
 const key=name=>fs.readFileSync(path.join(root,'firebase-migration-20261015/secrets',name),'utf8').trim();
 const shared={version:1,origin:'https://playcrownlands.com'};
 const configs={auth:{...shared,role:'auth',schema:AUTH,rateKey:auth.rateKey,google:auth.google,hashConfig:auth.hashConfig},
 game:{...shared,role:'game',schema:GAME,authSchema:AUTH,rateKey:auth.rateKey,translation,secrets:{LINKED_ACCOUNT_IP_HMAC_KEY:key('LINKED_ACCOUNT_IP_HMAC_KEY'),STRIPE_CROWNS_TEST_SECRET_KEY:key('STRIPE_CROWNS_TEST_SECRET_KEY'),STRIPE_CROWNS_LIVE_SECRET_KEY:key('STRIPE_CROWNS_LIVE_SECRET_KEY')}},
 worker:{...shared,role:'worker',schema:GAME,secrets:{LINKED_ACCOUNT_IP_HMAC_KEY:key('LINKED_ACCOUNT_IP_HMAC_KEY')}},
 mail:{...shared,role:'mail',schema:AUTH,apiKey:fs.readFileSync(path.join(progress.accountMailService.bundle,'resend-api-key'),'utf8').trim()},
 push:{...shared,role:'push',schema:GAME,keys:require('../../local-backend/node_modules/web-push').generateVAPIDKeys()},
 payments:{...shared,role:'payments',schema:GAME}};
 for(const mode of ['test','live'])configs.payments[mode]={key:key(`STRIPE_CROWNS_${mode.toUpperCase()}_SECRET_KEY`),webhookSecret:key(`STRIPE_CROWNS_${mode.toUpperCase()}_WEBHOOK_SECRET`)};
 const before=fs.readFileSync('/etc/caddy/Caddyfile','utf8');
 fs.mkdirSync(bundle,{mode:0o700});const write=(file,value)=>fs.writeFileSync(path.join(bundle,file),value,{mode:0o600,flag:'wx'});
 for(const [name,config] of Object.entries(configs))write(name+'.json',JSON.stringify(config));
 write('payment-ingress.json',JSON.stringify({test:configs.payments.test.webhookSecret,live:configs.payments.live.webhookSecret}));
 write('activation.json',JSON.stringify({version:1,phase:'standby',epoch:crypto.randomBytes(16).toString('hex')}));
 write('monitoring.json',JSON.stringify({previewGameSchema:push.schema}));
 for(const role of [...COMPONENTS,'payment-ingress','operations'])write('crownlands-'+role+'.service',unit(role));
 write('crownlands-operations-collect.service',`[Unit]\nDescription=Collect private Crownlands service health\nAfter=postgresql.service\n\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 ${ROOT}/collect_operations.py\nTimeoutStartSec=90\nUMask=0077\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectHome=yes\nProtectSystem=strict\nReadWritePaths=/var/lib/crownlands-operations\n`);
 write('crownlands-operations-collect.timer','[Unit]\nDescription=Check Crownlands services every 30 seconds\n\n[Timer]\nOnBootSec=15\nOnUnitActiveSec=30\nAccuracySec=2\nUnit=crownlands-operations-collect.service\n\n[Install]\nWantedBy=timers.target\n');
 write('Caddyfile',caddy(before));copyRuntime(repo,path.join(bundle,'app'));fs.copyFileSync(process.execPath,path.join(bundle,'node'));
 const scripts=path.join(bundle,'app/tools/local-migration');fs.mkdirSync(scripts,{recursive:true});fs.copyFileSync(path.join(__dirname,'initialize_permanent_schema.js'),path.join(scripts,'initialize_permanent_schema.js'));
 fs.copyFileSync(path.join(__dirname,'postgres_backup.py'),path.join(bundle,'postgres_backup.py'));
 for(const name of ['install_permanent_services.py','collect_operations.py','install_database_backup.py'])fs.copyFileSync(path.join(__dirname,name),path.join(bundle,name));
 write('manifest.json',JSON.stringify({version:1,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:repo}).trim(),caddyBeforeHash:crypto.createHash('sha256').update(before).digest('hex'),backupHelperBeforeHash:crypto.createHash('sha256').update(fs.readFileSync('/usr/local/lib/crownlands-backup/postgres_backup.py')).digest('hex'),components:COMPONENTS,activation:'standby'},null,2));
 write('SHA256SUMS',hashes(bundle).join('\n')+'\n');console.log('Permanent service bundle prepared in standby; no accounts, events or routes changed.');
}
if(require.main===module)prepare(process.argv[2]).catch(()=>{console.error('Permanent preparation stopped; private details suppressed and partial files preserved.');process.exitCode=1;});
module.exports={unit,caddy,prepare};
