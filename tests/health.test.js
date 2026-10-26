const test=require('node:test'),assert=require('node:assert/strict');
const {problems}=require('../ops/health');
const initial=require('../fuel-rates.json');
function fresh(){const d=structuredClone(initial);d.generatedAt='2026-10-26T15:00:00Z';d.carriers.forEach(c=>{c.status='ok';c.lastVerified='2026-10-26'});d.backupCheck={mismatches:[]};return d;}
const now=new Date('2026-10-26T17:00:00Z');
test('healthy carrier data produces no exception',()=>assert.deepEqual(problems(fresh(),now),[]));
test('missing carrier, stale rate, invalid value, and stopped scheduler produce exceptions',()=>{
  const d=fresh();d.carriers.pop();d.carriers[0].status='stale';d.carriers[1].services[0].current=null;d.generatedAt='2026-10-12T00:00:00Z';
  assert.ok(problems(d,now).length>=4);
});
test('backup formula drift alone does not page an owner; published/API conflict does',()=>{
  const d=fresh();d.backupCheck.mismatches=[{row:'UPS',api:40,derived:39}];assert.deepEqual(problems(d,now),[]);
  d.backupCheck.mismatches[0].kind='published-api-conflict';d.backupCheck.mismatches[0].posted=41;assert.equal(problems(d,now).length,1);
});
test('embedded JavaScript remains syntactically valid',()=>{
  const fs=require('fs'),vm=require('vm');
  for(const name of ['fuel-tracker.html','pnp-fuel-tracker-embed.html'])for(const m of fs.readFileSync(require('path').join(__dirname,'..',name),'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});

test('Monday data stays valid through Sunday; next Monday requires verification',()=>{
 const d=fresh();assert.deepEqual(problems(d,new Date('2026-11-01T17:00:00Z')),[]);
 assert.ok(problems(d,new Date('2026-11-02T17:00:00Z')).length);
});
