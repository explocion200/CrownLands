"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright');
const {extractFunction}=require('./world-travel-test-fixtures');
const source=fs.readFileSync('game.js','utf8');
const functions=['getScriptVersionFromDocument','getBuildIdFromDocument','getBuildIdFromHtml'].map(n=>extractFunction(source,n)).join('\n');
(async()=>{
 let parses=0;const c=vm.createContext({DOMParser:class{constructor(){parses++;throw Error('No DOM needed for a generated stamp');}}});vm.runInContext(functions,c);
 for(const file of ['index.html',...(fs.existsSync('dist/index.html')?['dist/index.html']:[])]){
  const html=fs.readFileSync(file,'utf8'),expected=html.match(/name="crownlands-build" content="([^"]+)"/)[1];
  for(let i=0;i<100;i++)assert.equal(c.getBuildIdFromHtml(html),expected);
 }
 assert.equal(parses,0,'Background checks must not allocate parsed game pages');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();let requests=0;await context.route('**/*',r=>{requests++;return r.abort();});const page=await context.newPage();await page.setContent('<html><head></head><body></body></html>');await page.addScriptTag({content:functions});
  const cases=[['<meta content="legacy" name="crownlands-build">','legacy'],["<meta name='crownlands-build' content=' old&amp;build '>",'old&build'],['<script src="https://fixture.test/game.js?v=script-version"></script>','script-version'],['<!-- <meta name="crownlands-build" content="fake" /> --><meta name="crownlands-build" content="real" />','real'],['<script>const x=\'<meta name="crownlands-build" content="fake" />\';</script><meta name="crownlands-build" content="real" />','real'],['<html>Unavailable</html>',''],['','']];
  for(const [html,expected]of cases)assert.equal(await page.evaluate(html=>getBuildIdFromHtml(html),html),expected);
  assert.equal(requests,0,'Reading an update stamp must not execute or fetch its scripts');
 }finally{await browser.close();}
 console.log('Build-stamp reader: generated pages avoid DOM allocation; legacy attribute order, quoting, entities, script fallback and inert parsing preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
