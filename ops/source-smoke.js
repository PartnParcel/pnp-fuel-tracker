const {URLS,parseUPSPage,parseFedEx,parsePurolator,parseLoomis}=require('../published-pages');
const {readPage}=require('../browser-source');
(async()=>{for(const [name,parser] of [['UPS',parseUPSPage],['FedEx',parseFedEx],['Purolator',parsePurolator],['Loomis',parseLoomis]]){const data=await readPage(URLS[name],parser);console.log(name,JSON.stringify(data));}})().catch(e=>{console.error(e.message);process.exitCode=1});
