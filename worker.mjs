// Runs only in the deploying customer's account. No model API keys or gateway fallback.
export const MODEL='@cf/meta/llama-3.2-3b-instruct';
export const DAILY_TASKS=5, MAX_PROMPT_BYTES=6000, MAX_OUTPUT_TOKENS=512;
const FORGE='https://forge.ku13sh.com';
export function setup(env){
 if(env.FREE_PLAN_ONLY!=='confirmed')throw Error('Confirm Workers Free in your own account first.');
 let value;try{value=JSON.parse(env.FORGE_SETUP);}catch{throw Error('Add the private setup value from Forge.');}
 if(!/^world_[a-zA-Z0-9]+$/.test(value.world)||typeof value.code!=='string'||value.code.length<20)throw Error('Invalid setup value.');
 return value;
}
export async function initialize(db){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, day TEXT NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS attempts_day ON attempts(day)'),
  db.prepare('CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY, until_ms INTEGER NOT NULL)')
 ]);
}
export async function reserve(db,id,day){
 const r=await db.prepare('INSERT OR IGNORE INTO attempts(id,day) SELECT ?,? WHERE (SELECT COUNT(*) FROM attempts WHERE day=?) < ?').bind(id,day,day,DAILY_TASKS).run();
 return r.meta.changes===1;
}
export async function tick(env,{fetcher=(...a)=>fetch(...a),now=()=>Date.now(),ai=env.AI}={}){
 const config=setup(env),db=env.DB;await initialize(db);
 const time=now(),day=new Date(time).toISOString().slice(0,10);
 const lock=await db.prepare("INSERT INTO locks(id,until_ms) VALUES('tick',?) ON CONFLICT(id) DO UPDATE SET until_ms=excluded.until_ms WHERE locks.until_ms < ?").bind(time+240000,time).run();
 if(lock.meta.changes!==1)return;
 try{
  let token='';
  const api=async(path,body={},lease='',pair='')=>{
   const response=await fetcher(FORGE+'/v1/workspaces/'+config.world+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(token?{'X-Runtime-Token':token,'X-Workspace-Token':token}:{}),...(lease?{'X-Run-Lease':lease}:{}),...(pair?{'X-Pairing-Code':pair}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Forge connection refused ('+response.status+'). No work was retried.');
   return response.json();
  };
  const stored=await db.prepare('SELECT value FROM settings WHERE id=?').bind('runtime').first();
  let saved=stored?JSON.parse(stored.value):null;
  // A changed setup code explicitly replaces revoked pairing; ordinary restarts reuse it.
  const setupHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.FORGE_SETUP)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(!saved||saved.setupHash!==setupHash){
   const result=await api('/runtime/connect',{name:'My cloud assistant',framework:'cloudflare-free',manifest:{version:1,name:'My cloud assistant',agents:[{id:'agent',name:'Cloud assistant',role:'general'}]},handlers:[{id:'ask',name:'Ask my cloud assistant',agent_ids:['agent'],description:'Customer Cloudflare account · 5 tasks/day · short drafts, summaries and plans'}],capabilities:['launch','cancel']},'',config.code);
   saved={world:config.world,token:result.runtime_token,setupHash};
   await db.prepare('INSERT OR REPLACE INTO settings(id,value) VALUES(?,?)').bind('runtime',JSON.stringify(saved)).run();
  }
  if(saved.world!==config.world)throw Error('Pairing belongs to another world.');
  token=saved.token;
  const claim=await api('/runtime/claim');if(!claim.run)return;
  const run=claim.run,lease=claim.lease_token,path='/runs/'+run.id;
  let sequence=now()*1000,revision=0,cancelled=false,lost=false,ended=false,timer,pending=Promise.resolve();
  const pulse=async()=>{const p=await api(path+'/pulse',{observed_state:'running',seen_revision:revision},lease);revision=p.revision;cancelled=p.desired==='cancelled';};
  const beat=()=>{timer=setTimeout(()=>{pending=pulse().catch(()=>{lost=true;}).finally(()=>{if(!ended&&!lost)beat();});},10000);};
  const event=(type,report='',summary='')=>api('/events',{event_id:crypto.randomUUID(),sequence:++sequence,agent_id:'agent',type,task:run.prompt.slice(0,2000),report,summary,run_id:run.id},lease);
  let status='failed',report='',error='';
  try{
   await pulse();if(cancelled){status='cancelled';return await api(path+'/finish',{status,results:{},error:'Cancelled before inference.'},lease);}
   if(new TextEncoder().encode(run.prompt).length>MAX_PROMPT_BYTES)throw Error('Use a shorter prompt: cloud tasks accept up to 6,000 UTF-8 bytes.');
   if(!await reserve(db,run.id,day))throw Error('Cloud task limit reached or task already attempted. Five attempts per UTC day; no automatic retry.');
   await event('agent.started');beat();
   // Exactly one call. Errors, rate limits and uncertain outcomes consume an attempt.
   let aiTimer;const answer=await Promise.race([ai.run(MODEL,{messages:[{role:'system',content:'Help with a short summary, draft or practical plan. No browsing or tools are available. Do not claim to have performed external actions.'},{role:'user',content:run.prompt}],max_tokens:MAX_OUTPUT_TOKENS}),new Promise((_,reject)=>{aiTimer=setTimeout(()=>reject(Error('Cloud inference timeout')),60000);})]).finally(()=>clearTimeout(aiTimer));
   if(typeof answer?.response!=='string'||answer.response.length>20000)throw Error('Cloud agent returned an invalid or oversized report.');
   report=answer.response;status='completed';
  }catch(e){error=/^(Use a shorter prompt|Cloud task limit reached|Cloud agent returned)/.test(e.message)?e.message:'Cloud execution stopped. Your free allowance may be exhausted or the provider unavailable. No paid fallback or automatic retry.';}
  finally{ended=true;clearTimeout(timer);await pending;}
  if(lost)throw Error('Lease lost; outcome is unknown. No automatic retry.');
  await pulse();if(cancelled){status='cancelled';report='';error='Cancelled at the next boundary. An in-flight model call may have used your allowance.';}
  if(status!=='cancelled')await event(status==='completed'?'agent.completed':'agent.failed',report,status==='completed'?'Cloud assistant returned a draft; review it.':error);
  await api(path+'/finish',{status,error,results:status==='completed'?{agent:{report,summary:'Cloud assistant returned a draft; review it.'}}:{}},lease);
  // Small bounded history. Run leases prevent replay of older tasks.
  await db.prepare('DELETE FROM attempts WHERE day < ?').bind(new Date(time-7*86400000).toISOString().slice(0,10)).run();
 }finally{await db.prepare("DELETE FROM locks WHERE id='tick' AND until_ms=?").bind(time+240000).run();}
}
export default {
 fetch(){return new Response('Agent Forge cloud connector. Tasks are accepted only through your paired Forge world.',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});},
 async scheduled(controller,env,ctx){ctx.waitUntil(tick(env).catch(()=>{console.error('Cloud connector paused or could not complete this tick. Check pairing, Free plan, bindings and retained task status. No task replay.');}));}
};
