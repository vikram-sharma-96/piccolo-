import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const profile=path.resolve(`test-results/download-before-${Date.now()}`);await mkdir(profile,{recursive:true});
let bytes=0,app;const fixture=createServer((req,res)=>{
 if(req.url==='/file'){res.writeHead(200,{'Content-Disposition':'attachment; filename="harmless.txt"'});res.end('Harmless drive-by fixture');}
 else if(req.url==='/slow'){res.writeHead(200,{'Content-Disposition':'attachment; filename="slow.txt"'});const timer=setInterval(()=>{bytes+=4096;res.write(Buffer.alloc(4096));},50);res.on('close',()=>clearInterval(timer));}
 else res.end('<h1>Download baseline</h1><script>setTimeout(()=>location.href="/file",100)</script>');
});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${fixture.address().port}`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));const observations=[];
try{
 const env={...process.env,PICCOLO_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:path.resolve('release/0.3.0/win-unpacked/Piccolo.exe'),args:[],env});const page=await app.firstWindow();await page.waitForFunction(()=>!!window.piccolo);
 const cmd=c=>page.evaluate(c=>window.piccolo.command(c),c),state=()=>page.evaluate(()=>window.piccolo.state());
 await app.evaluate(({dialog})=>{globalThis.approvals=0;dialog.showMessageBox=async()=>{globalThis.approvals++;return {response:0}};});
 const s=await state();await cmd({type:'settings',value:{...s.settings,askDownload:false,downloadDirectory:profile}});
 await cmd({type:'navigate',input:base});
 for(let i=0;i<100;i++){if((await state()).downloads.some(d=>d.status==='completed'))break;await wait(50);}
 const complete=(await state()).downloads.find(d=>d.status==='completed');
 observations.push({case:'JavaScript drive-by without consent',completed:!!complete,approvalCount:await app.evaluate(()=>globalThis.approvals)});
 await cmd({type:'navigate',input:base+'/slow'});await wait(350);const slow=(await state()).downloads.find(d=>d.url.endsWith('/slow'));
 await cmd({type:'download',id:slow.id,action:'cancel'});await wait(200);const before=bytes;await wait(300);
 observations.push({case:'Cancel real transfer',status:(await state()).downloads.find(d=>d.id===slow.id).status,serverBytesAfterCancel:bytes-before});
 await cmd({type:'navigate',input:'piccolo://downloads'});await page.locator('.download-card').first().waitFor();
 observations.push({case:'Default download list retains canceled record',visible:await page.getByText('slow.txt',{exact:true}).count()===1});
 await cmd({type:'download',id:complete.id,action:'cancel'});
 observations.push({case:'Late cancel mutates completed record',status:(await state()).downloads.find(d=>d.id===complete.id).status});
 await page.screenshot({path:path.join(profile,'downloads-before.png')});
}finally{await app?.close();fixture.closeAllConnections();fixture.close();await writeFile('test-results/download-baseline.json',JSON.stringify({date:new Date().toISOString(),profile,observations},null,2));console.log(JSON.stringify(observations,null,2));}
