'use strict';
const cheerio=require('cheerio');
const {dateISO,monday,offset,parseUPS,UPS_FIELDS}=require('./carrier-sources');
const URLS={UPS:'https://www.ups.com/ca/en/support/shipping-support/shipping-costs-rates/fuel-surcharges',FedEx:'https://www.fedex.com/en-ca/shipping/fuel-surcharges.html',Purolator:'https://www.purolator.com/en/shipping/courier-fuel-surcharges',Loomis:'https://www.loomisexpress.com/loomship/Services/FuelSurcharges'};
const clean=s=>s.replace(/\s+/g,' ').trim();
function percent(s){const m=clean(s).match(/^(\d{1,3}(?:\.\d{1,2})?)%$/);if(!m||+m[1]>100)throw Error('Invalid percentage');return +m[1];}
function iso(s){const d=new Date(s+' UTC');if(!Number.isFinite(+d))throw Error('Invalid date');return d.toISOString().slice(0,10);}
function ranges(s){const m=s.match(/^([A-Za-z]+ \d{1,2}, \d{4})\s*[-–]\s*([A-Za-z]+ \d{1,2}, \d{4})$/);return m?{start:iso(m[1]),end:iso(m[2])}:null;}
function rows(html){const $=cheerio.load(html);return $('table').toArray().map(t=>({text:clean($(t).text()),rows:$(t).find('tr').toArray().map(r=>$(r).find('th,td').toArray().map(c=>clean($(c).text())))}));}
function selectPeriod(all,today,weekly=true){
 const unique=new Map();for(const r of all){if(r.end<r.start)throw Error('Invalid period');const prior=unique.get(r.start);if(prior&&JSON.stringify(prior)!==JSON.stringify(r))throw Error('Conflicting source rows');unique.set(r.start,r);}
 const found=[...unique.values()].filter(r=>r.start<=today&&today<=r.end);if(found.length!==1)throw Error('Current period missing or ambiguous');const current=found[0];
 if(weekly&&(current.start!==monday(today)||current.end!==offset(current.start,6)))throw Error('Wrong weekly period');
 const previous=[...unique.values()].find(r=>r.end===offset(current.start,-1));return {current,previous};
}
function parseUPSPage(html,today=dateISO()){
 const tables=rows(html).filter(t=>t.text.includes('Standard Service to the U.S.')&&t.text.includes('Domestic Express and Expedited'));
 if(tables.length!==1)throw Error('UPS history table missing');
 const values=tables[0].rows.filter(r=>/^\d{2}\/\d{2}\/\d{4}$/.test(r[0])).map(r=>{if(r.length!==5)throw Error('UPS columns changed');return Object.fromEntries(r.map((v,i)=>['Field'+(i+1),v]));});
 const result=parseUPS({FuelSurchargeResponse:{SurchargeHistory_en:{RevenueSurchargeHistory:values}}},today);result.services.forEach(s=>s.source=URLS.UPS);return result;
}
function parseFedEx(html,today=dateISO()){
 const tables=rows(html).filter(t=>/Effective Date/.test(t.text)&&/Intra-CAN/.test(t.text));
 if(tables.length<2)throw Error('FedEx current tables missing');const out={};
 for(const ground of [false,true]){const selected=tables.filter(t=>t.text.includes('pickup services')===ground);const periods=selected.flatMap(t=>t.rows).flatMap(r=>{const period=ranges(r[2]||'');return period?[{...period,values:[percent(r[0]),percent(r[1])]}]:[];});const {current,previous}=selectPeriod(periods,today);if(!previous)throw Error('FedEx prior week missing');const name=ground?'FedEx Ground and pickup services':'FedEx Express';if(out[name])throw Error('Duplicate FedEx service table');out[name]={services:[ground?'Intra-CAN and pickup services':'Intra-CAN','Intl.'].map((service,i)=>({service,current:current.values[i],previous:previous.values[i],effectiveDate:current.start,effectiveTo:current.end,source:URLS.FedEx}))};}return out;
}
function parsePurolator(html,today=dateISO()){
 const periods=rows(html).filter(t=>t.text.includes('Effective Dates')&&t.text.includes('Surcharge')).flatMap(t=>t.rows.flatMap(r=>{const period=ranges(r[0]||'');const match=(r[1]||'').match(/^(\d+(?:\.\d+)?)%/);return period&&match?[{...period,values:[percent(match[0])]}]:[];}));
 const {current,previous}=selectPeriod(periods,today,false);return {cadence:'monthly',services:[{service:'Courier (all services and destinations)',current:current.values[0],previous:previous?previous.values[0]:null,effectiveDate:current.start,effectiveTo:current.end,source:URLS.Purolator}]};
}
function parseLoomis(html,today=dateISO()){
 const tables=rows(html).filter(t=>t.text.includes('Effective Date')&&t.text.includes('Fixed Rate Volume Discounts'));const groups={dom:[],world:[]};
 for(const t of tables){const group=t.text.includes('Tariff/Percent Off Tariff')?'world':'dom';for(const r of t.rows){const m=(r[0]||'').match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);if(m)groups[group].push({date:`${m[3]}-${m[1]}-${m[2]}`,value:percent(r[1])});}}
 const services=Object.entries(groups).map(([group,list])=>{const byDate=new Map();for(const r of list){if(byDate.has(r.date)&&byDate.get(r.date)!==r.value)throw Error('Conflicting Loomis rates');byDate.set(r.date,r.value);}const dates=[...byDate.keys()].filter(d=>d<=today).sort().reverse();const date=dates[0];if(!date||Date.parse(today)-Date.parse(date)>=7*86400000)throw Error('Loomis current period missing');const prev=byDate.get(offset(date,-7));if(prev===undefined)throw Error('Loomis previous week missing');return {service:group==='dom'?'Domestic Express and Ground Service':'Worldwide Service',current:byDate.get(date),previous:prev,effectiveDate:date,effectiveTo:offset(date,6),source:URLS.Loomis};});return {services};
}
module.exports={URLS,parseUPSPage,parseFedEx,parsePurolator,parseLoomis};

function periodStart(today,cadence){
 if(cadence!=='monthly')return monday(today);
 const first=today.slice(0,7)+'-01';const mondayOfFirst=monday(first);const start=mondayOfFirst===first?first:offset(mondayOfFirst,7);
 return today>=start?start:periodStart(offset(first,-1),'monthly');
}
function previousForPeriod(carrier,previousCarrier,service,today){
 const prior=previousCarrier?.services?.find(s=>s.service===service.service);
 if(carrier.status!=='ok'||!prior||prior.current==null)return service.previous;
 const same=previousCarrier.lastVerified&&periodStart(previousCarrier.lastVerified,carrier.cadence)===periodStart(today,carrier.cadence);
 return same?(prior.previous??null):prior.current;
}
module.exports.previousForPeriod=previousForPeriod;
