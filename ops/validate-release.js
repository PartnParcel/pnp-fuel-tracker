const fs=require('node:fs');
const {problems}=require('./health');
const data=JSON.parse(fs.readFileSync(process.argv[2]||'fuel-rates.json','utf8'));
const errors=problems(data);
if(data.carriers.reduce((n,c)=>n+c.services.length,0)!==15)errors.push('Expected all 15 service rows.');
if(JSON.parse(fs.readFileSync('overrides.json','utf8')).overrides.length)errors.push('Release verification requires no manual overrides.');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log('All 15 service rows verified through the production source chain; no manual overrides.');
