'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {URLS}=require('./published-pages');
async function renderedHTML(url){
 if(!Object.values(URLS).includes(url))throw Error('Unsupported browser source');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fuel-browser-'));
 try{
  const {stdout}=await promisify(execFile)(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=15000',url],{timeout:45000,maxBuffer:8*1024*1024,env:{PATH:process.env.PATH,HOME:profile,LANG:'en_US.UTF-8'}});
  return stdout;
 }finally{await fs.rm(profile,{recursive:true,force:true});}
}
async function readPage(url,parse,today){
 let first;
 try{const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('HTTP '+response.status);return parse(await response.text(),today);}catch(e){first=e.message;}
 try{return parse(await renderedHTML(url),today);}catch(e){throw Error(`Direct read: ${first}; browser read: ${e.message.slice(0,180)}`);}
}
module.exports={renderedHTML,readPage};
