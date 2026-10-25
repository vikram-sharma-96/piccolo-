import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const latest=await read('test-results/evidence-support-latest.json');assert.ok(latest.results.every(result=>result.status==='Passed'));
const task=await read(path.join(latest.profile,'task.json')),verification=await read(path.join(latest.profile,'verification.json'));
assert.equal(task.status,'completed');assert.ok(verification.records.some(record=>record.status==='supported'&&record.sourceUrl&&record.snippet));
const root=path.resolve('docs/evidence/evidence-support');await mkdir(root,{recursive:true});
for(const file of ['note.txt','live-evidence.png'])await copyFile(path.join(latest.profile,file),path.join(root,file));
// Retain requested evidence, not an unnecessary copy of the publisher's whole page text.
await writeFile(path.join(root,'verification.json'),JSON.stringify({...verification,verificationSteps:verification.verificationSteps.map(step=>({...step,result:step.result?Object.fromEntries(Object.entries(step.result).filter(([key])=>key!=='text')):step.result}))},null,2));
const sessions=[];for(const file of ['test-results/adal-evidence-followup-result.json','test-results/adal-evidence-final-result.json']){const result=await read(file);sessions.push({sessionId:result.session_id,success:result.success,exitCode:result.exit_code,model:result.model,answer:result.answer});}
await writeFile(path.join(root,'adal-coding.json'),JSON.stringify({initialMcpCall:'Timed out after 300 seconds. Its underlying coding process continued and reached its 600-second limit; it wrote the initial patch/tests but did not finish.',continuations:sessions,rootReview:'Root independently reran tests/build/live check, added the live/evidence scripts and fixed the remaining bare-Free price bypass with one additional test. No private reasoning or credentials copied.'},null,2));
await writeFile(path.join(root,'live-report.json'),JSON.stringify({date:new Date().toISOString(),profile:latest.profile,status:task.status,modelDecisions:task.calls,source:task.sources,steps:task.steps.map(step=>({capability:step.capability,status:step.status,verified:step.verified,error:step.error})),records:verification.records,artifactEvidence:task.artifacts.filter(artifact=>artifact.evidence).map(artifact=>({id:artifact.id,title:artifact.title,evidence:artifact.evidence})),results:latest.results,approvalHandling:'Native consent functions were programmatically approved only in the isolated test profile. Actual AdaL/model, MCP browser observations and verification logic were used.'},null,2));
console.log('Retained actual evidence support records in '+root);
