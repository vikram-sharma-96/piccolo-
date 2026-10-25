import {_electron as electron} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=path.resolve('test-results/evidence-support-live-'+Date.now());await mkdir(profile,{recursive:true});
const env={...process.env,PICCOLO_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const results=[];const command=value=>page.evaluate(value=>window.piccolo.command(value),value);
function findEvidence(value,found=[]){
 if(!value||typeof value!=='object')return found;
 const snippet=value.snippet??value.matchingSnippet,sourceUrl=value.sourceUrl??value.source_url??value.url;
 if(typeof snippet==='string'&&typeof sourceUrl==='string'&&sourceUrl.startsWith('https://elevenlabs.io/'))found.push(value);
 for(const entry of Object.values(value))if(entry&&typeof entry==='object')findEvidence(entry,found);return found;
}
try{
 app=await electron.launch({args:['.'],env});page=await app.firstWindow();await page.waitForFunction(()=>window.piccolo);
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_window,options)=>({response:options.buttons?.includes('Trust browser control')?options.buttons.indexOf('Trust browser control'):1});});
 await command({type:'new-tab',url:'piccolo://agents'});await command({type:'agent',action:'connect'});
 assert.equal((await command({type:'agent',action:'status'})).connected,true,'Stop: Piccolo Agent is not connected.');
 await command({type:'new-tab',url:'https://elevenlabs.io/pricing'});const state=await page.evaluate(()=>window.piccolo.state()),tab=state.activeId;
 await page.waitForFunction(id=>window.piccolo.state().then(state=>!state.tabs.find(tab=>tab.id===id)?.loading),tab,{timeout:45000});
 const {taskId}=await command({type:'agent',action:'start',value:{tabs:[tab],maxCalls:12,instruction:'Read only the attached real ElevenLabs pricing page. Extract the visible Pro plan price and billing basis as an exact short quote. Do not use prior knowledge or this instruction as evidence. Create an artifact.note titled Observed Pro pricing, with that one observed quote and source URL, without extra numbers or claims. Independently verify.page using the exact observed price/number; never change or remove its amount on retry. Verify the note with verify.artifact. Ensure the verification record contains each checked numeric value, its actual source URL and a matching observed snippet; finish only if all support checks pass. If the source is unavailable, stop and report it; do not simulate data.'}});
 let task;
 for(let i=0;i<480;i++){const state=await command({type:'agent',action:'status'});task=state.tasks.find(task=>task.id===taskId);if(['completed','failed','canceled','interrupted'].includes(task?.status)&&!state.cleaningUp)break;await new Promise(resolve=>setTimeout(resolve,1000));}
 await writeFile(path.join(profile,'task.json'),JSON.stringify(task,null,2));assert.equal(task.status,'completed',task.error+' '+JSON.stringify(task.steps.map(step=>({capability:step.capability,error:step.error}))));
 const verification=task.steps.filter(step=>step.verified),records=findEvidence(verification);assert.ok(records.length,'Actual verification result must contain source URL and matching snippet');assert.ok(records.some(record=>/\d/.test(record.snippet??record.matchingSnippet)),'Evidence must support an actual number');
 const note=task.artifacts.find(artifact=>artifact.mime==='text/plain');assert.ok(note,'A real note artifact must exist');const artifact=await command({type:'agent',action:'artifact',value:note.id});await writeFile(path.join(profile,'note.txt'),artifact.data);
 await writeFile(path.join(profile,'verification.json'),JSON.stringify({verified:true,records,verificationSteps:verification},null,2));
 const finalState=await page.evaluate(()=>window.piccolo.state());await command({type:'tab',action:'activate',id:finalState.tabs.find(tab=>tab.url==='piccolo://agents').id});await page.screenshot({path:path.join(profile,'live-evidence.png')});
 results.push({name:'Real in-app AdaL observes a real price, writes note, and returns numeric evidence snippets in verification',status:'Passed'});console.log('PASS evidence support live check');console.log(JSON.stringify(records));
}catch(error){console.error(error);results.push({status:'Failed',error:String(error),stack:error.stack});process.exitCode=1;}
finally{await app?.close().catch(()=>{});await writeFile(path.join(profile,'report.json'),JSON.stringify({profile,results,date:new Date().toISOString()},null,2));await writeFile('test-results/evidence-support-latest.json',JSON.stringify({profile,results},null,2));console.log('Evidence '+profile);}
