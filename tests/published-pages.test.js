const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {parseUPSPage,parseFedEx,parsePurolator,parseLoomis}=require('../published-pages');
const fixture=n=>fs.readFileSync(__dirname+'/fixtures/'+n+'-2026-10-26.html','utf8');
test('FedEx publishes both exact weekly service tables, not future band tables',()=>{
 const x=parseFedEx(fixture('fedex'),'2026-10-26');assert.deepEqual(x['FedEx Express'].services.map(s=>[s.current,s.previous]),[[53.5,51.5],[41.5,41]]);assert.deepEqual(x['FedEx Ground and pickup services'].services.map(s=>[s.current,s.previous]),[[53.5,51.5],[23,22.75]]);
 assert.throws(()=>parseFedEx(fixture('fedex'),'2026-11-02'),/missing/);
});
test('Loomis reads its own domestic and Worldwide rows; unchanged previous week is no change',()=>{
 const x=parseLoomis(fixture('loomis'),'2026-10-26');assert.deepEqual(x.services.map(s=>[s.current,s.previous]),[[52.05,50.55],[25.75,25.75]]);assert.throws(()=>parseLoomis(fixture('loomis'),'2026-11-02'),/missing/);
});
const puro='<table><tr><th>Effective Dates</th><th>Surcharge | Average Four-Week Fuel Price per Litre</th></tr><tr><td>October 5, 2026 - November 1, 2026</td><td>50.00% | $2.4555</td></tr><tr><td>November 2, 2026 - December 6, 2026</td><td>55.00% | $2.6438</td></tr><tr><td>December 7, 2026 - January 3, 2026</td><td>To be posted</td></tr></table>';
test('Purolator selects monthly effective period and ignores unposted malformed future placeholder',()=>{
 let x=parsePurolator(puro,'2026-10-26');assert.equal(x.cadence,'monthly');assert.equal(x.services[0].current,50);assert.equal(x.services[0].previous,null);
 x=parsePurolator(puro,'2026-11-02');assert.equal(x.services[0].current,55);assert.equal(x.services[0].previous,50);
 assert.throws(()=>parsePurolator(puro.replace('50.00%','bad'),'2026-10-26'),/missing/);
});
test('Rendered UPS history parses the same current and previous rows as official JSON',()=>{
 const json=require('./fixtures/ups-ca-2026-10-26.json');const rows=json.FuelSurchargeResponse.SurchargeHistory_en.RevenueSurchargeHistory;const html='<table><tr><th>Standard Service to the U.S.:</th><th>Domestic Express and Expedited:</th></tr>'+rows.map(r=>'<tr>'+[1,2,3,4,5].map(i=>'<td>'+r['Field'+i]+'</td>').join('')+'</tr>').join('')+'</table>';
 assert.deepEqual(parseUPSPage(html,'2026-10-26').services.map(s=>s.current),[23.5,53,42.25,38.75]);
});
