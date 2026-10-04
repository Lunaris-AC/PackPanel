const fs=require('fs');const crypto=require('crypto');const assert=require('assert/strict');
const s=JSON.parse(fs.readFileSync(require('path').join(process.env.PACKPANEL_CHECK_DIR, 'validation-session.json')));const root=s.base+'/api';
async function req(route,method='GET',body,token=s.token,status=200){const r=await fetch(root+route,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,route+' '+JSON.stringify(d));return d;}
(async()=>{
const users=[];try{
for(const role of ['viewer','operator']){const name='release-'+role+'-'+crypto.randomBytes(3).toString('hex');const password='Aa1!'+crypto.randomBytes(16).toString('hex');const u=(await req('/users','POST',{username:name,password,role},s.token,201)).user;users.push(u.id);const login=await req('/auth/login','POST',{username:name,password});const token=login.token || login.session?.token;const pair=typeof token==='string' && token.includes(':')?token:login.sessionId+':'+token;
await req('/v2/instances/'+s.instance.id+'/publish','POST',undefined,pair,403);
await req('/v2/instances/'+s.instance.id,'PUT',{description:'unauthorized'},pair,403);
if(role==='operator'){await req('/users/'+u.id+'/permissions','PUT',{permissions:[{endpoint_id:s.instance.endpoint_id,can_write:true,can_publish:false}]});await req('/v2/instances/'+s.instance.id,'PUT',{description:'authorized write'},pair,200);await req('/v2/instances/'+s.instance.id+'/publish?check=true','POST',undefined,pair,403);await req('/endpoints/'+s.instance.endpoint_id+'/explorer/save-file','POST',{path:'config/blocked.txt',content:'blocked',commitNow:true},pair,403);}}
await req('/v2/instances/'+s.instance.id,'PUT',{minecraftVersion:'not-a-real-version'},s.token,400);
await req('/v2/instances/'+s.instance.id,'PUT',{javaVersion:8},s.token,400);
await req('/v2/instances','GET',undefined,'invalid:token',401);
await req('/endpoints/'+s.instance.endpoint_id+'/explorer/save-file','POST',{path:'config/draft-check.txt',content:'draft value',commitNow:false});
let manifest=await req('/v2/instances/'+s.instance.id+'/manifest');assert.ok(!manifest.files.some(f=>f.path==='config/draft-check.txt'));
await req('/v2/instances/'+s.instance.id+'/publish','POST');manifest=await req('/v2/instances/'+s.instance.id+'/manifest');assert.ok(manifest.files.some(f=>f.path==='config/draft-check.txt'));
console.log('PASS viewer/operator permissions, invalid inputs, malformed tokens and explicit publication of saved drafts');
}finally{for(const id of users)await req('/users/'+id,'DELETE');}})().catch(e=>{console.error(e.message);process.exitCode=1;});
