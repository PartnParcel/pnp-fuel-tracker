'use strict';
const {monday,dateISO} = require('../carrier-sources');
const {CARRIERS} = require('../fuel-engine');
function problems(data, now=new Date()) {
  const out=[];
  const age=(now-Date.parse(data.generatedAt))/3600000;
  if(!Number.isFinite(age)||age>168||age<-.1) out.push('Published data timestamp is missing, future-dated or more than 7 days old.');
  const names=[...CARRIERS.map(c=>c.name),'Canada Post','Canpar Express'];
  for(const name of new Set(names)) {
    const c=data.carriers?.find(c=>c.name===name);
    if(!c || !c.services?.length){out.push(`${name}: missing carrier rows.`);continue;}
    if(c.services.some(s=>s.effectiveTo&&s.effectiveTo<dateISO(now)))out.push(`${name}: source effective period expired.`);
    if(c.status!=='ok')out.push(`${name}: using last-known data; source verification failed.`);
    if(!c.lastVerified || c.lastVerified<monday(dateISO(now)))out.push(`${name}: not verified this week.`);
    if(c.services.some(s=>!Number.isFinite(s.current)||s.current<0||s.current>100))out.push(`${name}: invalid or missing rate.`);
  }
  for(const m of data.backupCheck?.mismatches || []) if(m.kind==='published-api-conflict')out.push(`${m.row}: posted rate and API disagree (${m.posted}% vs ${m.api}%).`);
  return out.sort();
}
module.exports={problems};

if(require.main===module){
  const data=JSON.parse(require("fs").readFileSync("fuel-rates.json","utf8"));
  const findings=problems(data);
  console.log(findings.length?findings.join("\n"):"All carrier rows verified.");
}
