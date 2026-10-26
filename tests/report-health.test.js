const {test}=require('node:test');
const assert=require('node:assert/strict');
const {report}=require('../ops/report-health');
test('exception is created once, unchanged reruns are quiet, changes update, recovery closes',async()=>{
 let issue, writes=[];
 const request=async(path,method='GET',body)=>{
   if(method==='GET')return issue?[issue]:[];
   writes.push({path,method,body});
   if(method==='POST')issue={number:1,...body};
   else Object.assign(issue,body);
   return issue;
 };
 await report(['UPS stale'],request,'example/repo');assert.equal(writes.length,1);assert.equal(writes[0].method,'POST');
 await report(['UPS stale'],request,'example/repo');assert.equal(writes.length,1);
 await report(['Canada Post stale'],request,'example/repo');assert.equal(writes.length,2);assert.equal(writes[1].method,'PATCH');
 await report([],request,'example/repo');assert.equal(writes.length,3);assert.equal(issue.state,'closed');
});
test('GitHub reporting failures propagate instead of claiming success',async()=>{
 await assert.rejects(report(['stale'],async()=>{throw Error('403')},'example/repo'),/403/);
});
