const {URLS,parseUPSPage,parseFedEx,parsePurolator,parseLoomis}=require('../published-pages');
const {readPage}=require('../browser-source');
(async()=>{let failed=false;for(const [name,parser] of [['UPS',parseUPSPage],['FedEx',parseFedEx],['Purolator',parsePurolator],['Loomis',parseLoomis]]){try{const data=await readPage(URLS[name],parser);console.log(name,JSON.stringify(data));}catch(e){failed=true;console.error(name,e.message);}}if(failed)process.exitCode=1;})().catch(e=>{console.error(e.message);process.exitCode=1});
