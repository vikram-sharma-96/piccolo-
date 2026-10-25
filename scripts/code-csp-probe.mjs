import {_electron as electron} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('test-results/code-csp-'+Date.now());await mkdir(root,{recursive:true});
const env={...process.env,PICCOLO_PROFILE:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env});let lastError='';
app.context().on('page',p=>p.on('pageerror',e=>{lastError=e.stack||e.message;console.log(lastError);}));
try{const page=await app.firstWindow();await page.waitForFunction(()=>!!window.piccolo);await app.evaluate(({app,dialog},root)=>{app.on('session-created',ses=>{ses.webRequest.onHeadersReceived((details,callback)=>{const headers=details.responseHeaders||{};for(const key of Object.keys(headers))if(key.toLowerCase()==='content-security-policy')headers[key]=headers[key].map(s=>s.replaceAll("'unsafe-eval'",''));callback({responseHeaders:headers});});});dialog.showOpenDialog=async()=>({filePaths:[root]});dialog.showMessageBox=async()=>({response:2});},root);await page.evaluate(()=>window.piccolo.command({type:'workspace',action:'pick'}));await new Promise(r=>setTimeout(r,1000));const match=lastError.match(/assets\/([^:)]+):(\d+):(\d+)/);if(match){const lines=(await readFile(path.join('dist/code/assets',match[1]),'utf8')).split('\n'),column=Number(match[3]);console.log('SOURCE',lines[Number(match[2])-1].slice(Math.max(0,column-400),column+200));}await writeFile(path.join(root,'error.txt'),lastError);}finally{await app.close();}
