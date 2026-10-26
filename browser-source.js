'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {URLS}=require('./published-pages');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function renderedRead(url,parse,today){
 if(!Object.values(URLS).includes(url))throw Error('Unsupported browser source');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fuel-browser-'));
 const child=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{detached:true,stdio:'ignore',env:{PATH:process.env.PATH,HOME:profile,LANG:'en_US.UTF-8'}});
 let launchError,ws;child.on('error',e=>{launchError=e;});const deadline=Date.now()+45000;let last='Browser startup timed out';
 try{
  let lines;while(Date.now()<deadline){if(launchError)throw launchError;try{lines=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;}catch{await sleep(100);}}
  if(!lines)throw Error(last);
  const tabs=await (await fetch(`http://127.0.0.1:${lines[0]}/json/list`,{signal:AbortSignal.timeout(5000)})).json();
  const target=tabs.find(t=>t.type==='page');if(!target)throw Error('Browser page unavailable');
  ws=new WebSocket(target.webSocketDebuggerUrl);await Promise.race([new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',e=>reject(Error('WebSocket: '+(e.message||e.error?.message||'connection error'))),{once:true});}),sleep(15000).then(()=>{throw Error('Browser connection timeout');})]);
  let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('Browser command timeout'));},5000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params,sessionId}));});
  await call('Page.enable');await call('Page.navigate',{url});
  while(Date.now()<deadline){const result=await call('Runtime.evaluate',{expression:'document.documentElement.outerHTML',returnByValue:true});try{return parse(result.result.value,today);}catch(e){last=e.message;}await sleep(500);}
  throw Error('Rendered page did not validate: '+last);
 }finally{
  ws?.close();if(child.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}await sleep(200);try{process.kill(-child.pid,'SIGKILL');}catch{}}
  await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
 }
}
async function readPage(url,parse,today){
 let first;
 try{const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('HTTP '+response.status);return parse(await response.text(),today);}catch(e){first=e.message;}
 try{return await renderedRead(url,parse,today);}catch(e){throw Error(`Direct read: ${first}; browser read: ${e.message.slice(0,180)}`);}
}
module.exports={renderedRead,readPage};
