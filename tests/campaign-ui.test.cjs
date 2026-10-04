// Run with linkedom 0.18.12 available on NODE_PATH (see tests/README.md).
const {parseHTML}=require('linkedom');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {document,window}=parseHTML(fs.readFileSync(path.join(root,'index.html'),'utf8'));
const state={user:{id:'owner'},profile:{id:'owner'},customers:[{id:'a',email:'a@example.invalid',name:'Eligible',marketing_email_opt_in:true,acquisition_last_touch:{gb_campaign:'c',gb_recipient:'a'}},{id:'b',email:'b@example.invalid',name:'Excluded',marketing_email_opt_in:false}],bookings:[{id:'bk1',customer_id:'a',status:'booked',created_at:'2026-10-03T13:00:00Z',booked_price:65},{id:'bk2',customer_id:'a',status:'cancelled',created_at:'2026-10-03T14:00:00Z',booked_price:40}],marketingCampaignSource:'business-health-retention',marketingCampaignCustomerIds:['a','b'],customerTimelineEvents:{}};
const $=id=>document.getElementById(id), calls=[];
const context={document,state,$,console,crypto:require('node:crypto').webcrypto,TextEncoder,window:{confirm:()=>false},buildPublicUrl:id=>`https://grabandbook.com/book.html?business=${id}`,sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},
 money:v=>`£${Number(v||0).toFixed(2)}`,escapeHtml:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast(){},setBusy:(btn,busy)=>btn.disabled=busy,
 supabaseClient:{functions:{invoke:async(name,body)=>{calls.push(body);return {data:{status:'sent',sent:1,excluded:1,failed:0}};}},from(table){const q={select(){return q},eq(){return q},order(){return q},range(){return q},limit(){return q},then(resolve){return Promise.resolve({data:table==='marketing_email_campaigns'?[{id:'c',subject:'Rebooking <script>bad()</script>',message_text:'Book your next visit.',status:'sent',audience_type:'business-health-retention',requested_count:2,sent_count:1,failed_count:0,excluded_count:1,created_at:'2026-10-03T12:00:00Z',started_at:'2026-10-03T12:00:00Z',completed_at:'2026-10-03T12:00:10Z'}]:[{customer_id:'a',customer_name:'Eligible',email:'a@example.invalid',status:'sent',sent_at:'2026-10-03T12:00:05Z'},{customer_id:'b',customer_name:'Excluded',email:'b@example.invalid',status:'excluded',exclusion_reason:'No marketing consent'}]}).then(resolve)}};return q;}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'assets/js/customers.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'assets/js/campaign-history.js'),'utf8'),context);
Object.assign(context,{renderCustomers(){},currentCustomerFilter:()=> 'all',filteredCustomersForCrm:()=>state.customers,syncMarketingTargetUi(){}});
$('marketingEmailForm').reset=()=>{};
(async()=>{
 await context.loadMarketingCampaignHistory();
 const detail=$('marketingCampaignHistory').querySelector('details');detail.open=true;detail.dispatchEvent(new window.Event('toggle'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(detail.textContent,/No marketing consent/);assert.equal(detail.querySelectorAll('script').length,0);assert.match(detail.textContent,/2 identified · 1 sent · 0 failed · 1 excluded/);assert.match(detail.textContent,/Recipients subsequently booked/);assert.match(detail.textContent,/£65.00/);
 state.marketingCampaignCustomerIds=['missing'];assert.equal(context.marketingEligibleCustomers().length,0,'empty locked cohort must never fall back');
 state.marketingCampaignCustomerIds=['a','b'];context.renderMarketingCampaignAudienceSummary();assert.equal($('marketingCampaignIdentified').textContent,'2');assert.equal($('marketingCampaignExcluded').textContent,'1');
 $('marketingSubject').value='Hello';$('marketingMessage').value='Book again';
 await context.sendMarketingEmail({preventDefault(){}});assert.equal(calls.length,0,'confirmation decline must not invoke sender');
 context.window.confirm=()=>true;await context.sendMarketingEmail({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(JSON.stringify(calls[0].body.customer_ids),JSON.stringify(['a','b']));assert.equal(calls[0].body.audience_type,'business-health-retention');assert.ok(calls[0].body.request_id);
 console.log('PASS: real HTML history renders, exclusions and audience counts correct, content escaped, explicit confirmation required, complete audience submitted, empty cohort stays locked');
})().catch(e=>{console.error(e);process.exit(1)});
