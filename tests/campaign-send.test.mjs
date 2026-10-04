import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/send-marketing-email/index.ts', import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const customer = (n, extra={}) => ({ id:id(n), profile_id:id(900),name:`Customer ${n}`, email:`test${n}@example.invalid`,marketing_email_opt_in:true,marketing_unsubscribe_token:id(n+200),archived_at:null,...extra });
function harness(customers, options={}) {
  const tables = {customers, profiles:[{id:id(900),business_name:'Test business'}],marketing_email_campaigns:[],marketing_campaign_recipients:[],customer_activity:[]};
  let handler, sends=0, deliveryReads=0;
  const providerCalls=[];
  const client = {
    auth:{getUser:async()=>({data:{user:options.unauthenticated ? null : {id:id(900)}}})},
    from(table) {
      let predicates=[], action='select', body, single=false, limit=Infinity;
      const query = {
        select(){return query;},eq(k,v){predicates.push(r=>r[k]===v);return query;},in(k,vs){predicates.push(r=>vs.includes(r[k]));return query;},
        order(){return query;},limit(n){limit=n;return query;},maybeSingle(){single=true;return query;},single(){single=true;return query;},
        update(value){action='update';body=value;return query;},insert(value){action='insert';body=value;return query;},
        then(resolve,reject) {return Promise.resolve().then(()=>{
          if (options.failSnapshot && table==='marketing_campaign_recipients' && action==='update' && body.status==='sent') return {data:null,error:new Error('Database unavailable after provider accepted')};
          let rows=tables[table].filter(r=>predicates.every(p=>p(r))).slice(0,limit);
          if (action==='update') rows.forEach(r=>Object.assign(r,body));
          if (action==='insert') {tables[table].push({...body});rows=[body];}
          return {data:single ? rows[0] || null : rows.map(r=>({...r})),error:null};
        }).then(resolve,reject);}
      };
      return query;
    },
    async rpc(name,p) {
      if (options.failCreate) return {error:new Error('Snapshot insert failed')};
      const existing=tables.marketing_email_campaigns.find(c=>c.request_id===p.p_request_id);
      if (existing) return {data:{created:false,campaign:{...existing}}};
      const campaign={id:id(800),profile_id:p.p_profile_id,request_id:p.p_request_id,status:'queued',sent_count:0,failed_count:0};
      tables.marketing_email_campaigns.push(campaign);
      tables.marketing_campaign_recipients.push(...p.p_recipients.map((r,i)=>({...r,id:id(600+i),campaign_id:campaign.id,profile_id:p.p_profile_id})));
      if (options.revokeAfterSnapshot) customers[0].marketing_email_opt_in=false;
      return {data:{created:true,campaign:{...campaign}}};
    }
  };
  vm.runInNewContext(source, {createClient:()=>client,Deno:{env:{get:key=>({SUPABASE_URL:'https://example.invalid',RESEND_API_KEY:'fake',EMAIL_FROM:'test@example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake'}[key])},serve:fn=>handler=fn},
    Request,Response,URL,AbortSignal,crypto,console:{error(){}},setTimeout:fn=>{fn();return 0;},
    fetch:async(url,opts)=>{
      if ((opts.method || 'GET')==='GET') {deliveryReads++; return new Response(JSON.stringify({last_event:options.deliveryEvent || 'delivered'}),{status:options.deliveryUnavailable ? 403 : 200});}
      sends++;providerCalls.push(opts);
      assert.ok(tables.marketing_campaign_recipients.length,'Audience must persist before contacting provider');
      if (options.networkFailure) throw new Error('Connection lost');
      return new Response(JSON.stringify(options.rejectSecond && sends===2 ? {message:'Rejected'} : {id:id(700+sends)}),{status:options.rejectSecond && sends===2 ? 422 : 200});
    }});
  async function invoke(body={}) { const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify({customer_ids:customers.map(c=>c.id),subject:'A visit',message_text:'Hello',request_id:id(1000),booking_url:`https://grabandbook.com/book.html?business=${id(900)}`,...body})}));return {status:response.status,data:await response.json()}; }
  return {tables,invoke,get sends(){return sends;},get deliveryReads(){return deliveryReads;},providerCalls};
}
test('saves exclusions, deduplicates email and preserves unsubscribe link',async()=>{
  const h=harness([customer(1),customer(2,{marketing_email_opt_in:false}),customer(3,{archived_at:'2026-01-01'}),customer(4,{email:'bad'}),customer(5,{email:'test1@example.invalid'})]);
  const r=await h.invoke();assert.equal(r.status,200);assert.equal(h.sends,1);assert.equal(r.data.excluded,4);assert.equal(h.tables.marketing_campaign_recipients.length,5);assert.match(h.providerCalls[0].body,/unsubscribe/);assert.match(h.providerCalls[0].body,/gb_campaign/);assert.match(h.providerCalls[0].body,/gb_recipient/);assert.ok(h.tables.marketing_campaign_recipients[0].booking_link.includes('gb_campaign'));assert.ok(h.providerCalls[0].headers['Idempotency-Key']);
});
test('duplicate and simultaneous requests send only once',async()=>{
  const h=harness([customer(1)]);await Promise.all([h.invoke(),h.invoke()]);await h.invoke();assert.equal(h.sends,1);assert.equal(h.tables.marketing_email_campaigns.length,1);
});
test('rechecks consent after audience snapshot',async()=>{const h=harness([customer(1)],{revokeAfterSnapshot:true});const r=await h.invoke();assert.equal(h.sends,0);assert.equal(r.data.excluded,1);});
test('partial provider failure is saved per recipient',async()=>{const h=harness([customer(1),customer(2)],{rejectSecond:true});const r=await h.invoke();assert.equal(r.data.status,'partial');assert.equal(r.data.sent,1);assert.equal(r.data.failed,1);});
test('network ambiguity stays unconfirmed and never resends on retry',async()=>{const h=harness([customer(1)],{networkFailure:true});const r=await h.invoke();assert.equal(r.data.status,'needs_review');assert.equal(r.data.failed,0);await h.invoke();assert.equal(h.sends,1);});
test('failure to save audience prevents all sends',async()=>{const h=harness([customer(1)],{failCreate:true});assert.equal((await h.invoke()).status,500);assert.equal(h.sends,0);});
test('provider acceptance followed by database failure is not marked rejected or resent',async()=>{const h=harness([customer(1)],{failSnapshot:true});assert.equal((await h.invoke()).status,500);assert.equal(h.tables.marketing_email_campaigns[0].status,'needs_review');await h.invoke();assert.equal(h.sends,1);});
test('foreign customer IDs and unauthenticated requests cannot send',async()=>{const h=harness([customer(1,{profile_id:id(901)})]);assert.equal((await h.invoke()).status,409);assert.equal(h.sends,0);const u=harness([customer(1)],{unauthenticated:true});assert.equal((await u.invoke()).status,401);});
test('server enforces 100 eligible recipient cap',async()=>{const h=harness(Array.from({length:101},(_,i)=>customer(i+1)));assert.equal((await h.invoke()).status,400);assert.equal(h.sends,0);});
test('delivery lookup records confirmation without inventing delivery time or sending again',async()=>{const h=harness([customer(1)]);await h.invoke();await h.invoke({action:'refresh_delivery',campaign_id:id(800)});assert.equal(h.tables.marketing_campaign_recipients[0].status,'delivered');assert.ok(!h.tables.marketing_campaign_recipients[0].delivered_at);assert.equal(h.sends,1);assert.equal(h.deliveryReads,1);});
test('unavailable delivery permission preserves send evidence',async()=>{const h=harness([customer(1)],{deliveryUnavailable:true});await h.invoke();const r=await h.invoke({action:'refresh_delivery',campaign_id:id(800)});assert.equal(r.data.unavailable,true);assert.equal(h.tables.marketing_campaign_recipients[0].status,'sent');});
test('bounce is recorded separately from provider acceptance',async()=>{const h=harness([customer(1)],{deliveryEvent:'bounced'});await h.invoke();await h.invoke({action:'refresh_delivery',campaign_id:id(800)});assert.equal(h.tables.marketing_campaign_recipients[0].status,'delivery_failed');assert.equal(h.tables.marketing_email_campaigns[0].sent_count,1);});
