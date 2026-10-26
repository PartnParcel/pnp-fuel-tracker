const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {parseUPS,parseCanadaPost,applyPublished,staleWeeks,dateISO} = require('../carrier-sources');
const {lookupBand} = require('../fuel-engine');
const ups = require('./fixtures/ups-ca-2026-10-26.json');
const cp = fs.readFileSync(__dirname+'/fixtures/canada-post-2026-10-26.html','utf8');
test('all 120 posted UPS interval boundary points match the backup engine',()=>{
  const keys={USDieselWorldwideStandard:'ups-standard-us',WithinCanadaDiesel:'ups-standard-canada',USGCJetFuel:'ups-international-jet',USGCJetFuelDomesticExpressExpedited:'ups-domestic-jet'};
  let count=0;
  for(const [key,rows] of Object.entries(ups.FuelSurchargeResponse.FuelSurchargeRates_en)) for(const r of rows){
    const lo=+r.Field1.replace(/[^\d.]/g,''),hi=+r.Field2.replace(/[^\d.]/g,'');
    for(const price of [lo,+(hi-.01).toFixed(2)]){assert.equal(lookupBand(keys[key],price).rate,parseFloat(r.Field3));count++;}
  }
  assert.equal(count,120);
});
test('UPS selects current effective week, not future or stale data',()=>{
  const data=structuredClone(ups), rows=data.FuelSurchargeResponse.SurchargeHistory_en.RevenueSurchargeHistory;
  rows.unshift({...rows[0],Field1:'02/11/2026',Field4:'99.00%'});
  const result=parseUPS(data,'2026-10-26');
  assert.equal(result.services.find(s=>s.service.includes('3 Day')).current,42.25);
  assert.equal(result.services.find(s=>s.service.includes('3 Day')).previous,41.75);
  assert.throws(()=>parseUPS(data,'2026-11-09'),/missing/);
  rows[1].Field4='42.25% 41.00%';assert.throws(()=>parseUPS(data,'2026-10-26'),/percentage/);
});
test('Canada Post uses charged rate and real previous-week rate on migration and rerun',()=>{
  const result=parseCanadaPost(cp,'2026-10-26');
  assert.deepEqual(result.services.map(s=>[s.current,s.previous,s.listRate]),[[40.3,39.9,47.5],[27,26.75,null],[25,24.75,null]]);
  const old={carriers:[{name:'Canada Post',services:[{service:'Domestic Services',current:47,previous:46.5}]}]};
  const c=[],keys=new Set();applyPublished(c,old,'Canada Post',{ok:true,value:result},'https://example.com','2026-10-26',keys);
  assert.equal(c[0].services[0].previous,39.9);
  const rerun=[];applyPublished(rerun,{carriers:c},'Canada Post',{ok:true,value:result},'https://example.com','2026-10-26',new Set());
  assert.deepEqual(c,rerun);assert.equal(keys.size,3);
});
test('Canada Post relief removal removes note and computes charged-rate increase',()=>{
  // Reuse real prior/current tables shifted one week, simulating relief ending.
  const html=cp.replaceAll('Oct 26, 2026 - Nov 1, 2026','Nov 2, 2026 - Nov 8, 2026').replaceAll('Oct 19, 2026 - Oct 25, 2026','Oct 26, 2026 - Nov 1, 2026')
    .replace(/<span style="text-decoration: line-through;">47.50%<\/span> 40.30%\*/,'47.50%')
    .replaceAll('39.90%','40.30%');
  const row=parseCanadaPost(html,'2026-11-02').services[0];
  assert.equal(row.current,47.5);assert.equal(row.listRate,null);assert.equal(+(row.current-row.previous).toFixed(2),7.2);
});
test('ambiguous cells, missing weeks and duplicate history fail closed',()=>{
  assert.throws(()=>parseCanadaPost(cp.replace('text-decoration: line-through;','color: red;'),'2026-10-26'),/ambiguous/);
  assert.throws(()=>parseCanadaPost(cp,'2026-11-09'),/missing/);
  const data=structuredClone(ups);data.FuelSurchargeResponse.SurchargeHistory_en.RevenueSurchargeHistory.push(data.FuelSurchargeResponse.SurchargeHistory_en.RevenueSurchargeHistory[0]);
  assert.throws(()=>parseUPS(data,'2026-10-26'),/duplicate/);
});
test('unavailable sources preserve last-known rates and verified date',()=>{
  const prev={carriers:[{name:'UPS Canada',status:'ok',lastVerified:'2026-10-19',services:[{service:'International',current:41.75,previous:42.5}]}]};
  const c=[];applyPublished(c,prev,'UPS Canada',{ok:false,error:'timeout'},'', '2026-10-26',new Set());
  assert.equal(c[0].status,'stale');assert.equal(c[0].lastVerified,'2026-10-19');assert.deepEqual(c[0].services,prev.carriers[0].services);assert.equal(prev.carriers[0].status,'ok');
});
test('hourly retries do not inflate stale-week counts; Toronto week boundary is used',()=>{
  let s=staleWeeks({status:'stale'},null,'2026-10-26');
  for(let i=0;i<20;i++)s=staleWeeks({status:'stale'},s,'2026-10-26');
  assert.equal(s.staleWeeks,1);assert.equal(staleWeeks({status:'stale'},s,'2026-11-02').staleWeeks,2);
  assert.equal(dateISO(new Date('2026-10-26T01:00:00Z')),'2026-10-25');
});
