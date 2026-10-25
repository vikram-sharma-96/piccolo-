import {_electron as electron} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {profile}=JSON.parse(await readFile('test-results/agent-latest.json','utf8'));
assert.ok(path.resolve(profile).startsWith(path.resolve('test-results')+path.sep),'Only a test profile may be reused');
const env={...process.env,PICCOLO_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
let app;const results=[];
try{
 app=await electron.launch({...process.env.PICCOLO_EXE?{executablePath:process.env.PICCOLO_EXE,args:[]}:{args:['.']},env});
 const page=await app.firstWindow();await page.waitForFunction(()=>window.piccolo);
 await page.evaluate(()=>window.piccolo.command({type:'new-tab',url:'piccolo://agents'}));
 await page.getByRole('heading',{name:'Piccolo Agent',exact:true}).waitFor();
 await page.locator('.agent-history > summary').click();
 await page.getByRole('button',{name:'Review task',exact:true}).first().click();
 await page.getByRole('button',{name:'Inspect',exact:true}).first().click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.ok((await dialog.locator('pre').innerText()).length>0);
 assert.match(await dialog.innerText(),/SHA-256 [a-f0-9]{64}/);
 assert.equal(await page.getByRole('button',{name:'Close artifact',exact:true}).evaluate(node=>document.activeElement===node),true);
 await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog')),true);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 results.push({name:'Actual retained artifact opens, displays bytes/hash, traps keyboard focus and closes with Escape',status:'Passed'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await app.evaluate(()=>[...globalThis[Symbol.for('piccolo.browser-registry')]][0].win.setSize(900,650));
 await page.waitForFunction(()=>document.querySelector('.agent-columns')&&getComputedStyle(document.querySelector('.agent-columns')).gridTemplateColumns.split(' ').length===1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
 await page.screenshot({path:path.join(profile,'compact-agent.png')});
 results.push({name:'Compact window uses one column without horizontal overflow under reduced motion',status:'Passed'});
 console.log('PASS Agent artifact keyboard and compact layout');
}catch(error){results.push({status:'Failed',error:String(error),stack:error.stack});console.error(error);process.exitCode=1;}
finally{await app?.close().catch(()=>{});await writeFile('test-results/agent-ui-checks.json',JSON.stringify({profile,results},null,2));}
