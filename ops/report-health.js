// One durable exception issue, updated only when its contents change. No success
// chatter; close the same issue on recovery. GitHub controls notification delivery.
const fs=require('fs');
const {problems}=require('./health');
async function run(){
  let issues;
  try{issues=problems(JSON.parse(fs.readFileSync('fuel-rates.json','utf8')));}catch{issues=['The published data file is unreadable.'];}
  if(process.env.FUEL_BUILD_OUTCOME!=='success')issues.push('The refresh or publication failed. Inspect the linked Actions run.');
  const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
  if(!repo || !token)throw Error('GitHub issue reporting credentials unavailable');
  const request=async(path,method='GET',body)=>{
    const r=await fetch(`https://api.github.com/repos/${repo}${path}`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error(`GitHub report failed: ${r.status}`);return r.json();
  };
  await report(issues, request, repo);
}
async function report(issues, request, repo){
  const title='Fuel tracker: automated verification needs attention';
  const open=await request('/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100');
  const existing=open.find(i=>i.title===title&&!i.pull_request);
  if(!issues.length){if(existing)await request(`/issues/${existing.number}`,'PATCH',{state:'closed',state_reason:'completed'});console.log('All carrier rows verified; no open fuel exception.');return;}
  const body='Automated fuel tracker checks need attention. Last-known data remains visible as stale where a source could not be verified.\n\n'+issues.map(p=>'- '+p).join('\n')+'\n\n[Latest refresh runs](https://github.com/'+repo+'/actions/workflows/fuel-update.yml)\n\nThis issue updates only when the problem changes and closes automatically after a healthy published refresh.';
  if(existing){if(existing.body!==body)await request(`/issues/${existing.number}`,'PATCH',{body});}
  else await request('/issues','POST',{title,body});
  console.error(issues.join('\n'));
}
module.exports={report};
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
