// Reduce each july_0107 ad set to a SINGLE ad: ad set "..._N" keeps ad "0107_videoN".
const path=require('path'),https=require('https');
const {apiGet}=require('./meta_api');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const ACCT=process.env.META_AD_ACCOUNT_ID,TOKEN=process.env.META_ACCESS_TOKEN;
function del(n){return new Promise((res,rej)=>{const q=new URLSearchParams({access_token:TOKEN}).toString();const r=https.request({hostname:'graph.facebook.com',path:`/v21.0/${n}?${q}`,method:'DELETE'},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})});r.on('error',rej);r.end();});}
(async()=>{
  const camps=await apiGet(`${ACCT}/campaigns`,{fields:'name,adsets.limit(20){name,ads.limit(20){id,name}}',filtering:JSON.stringify([{field:'name',operator:'CONTAIN',value:'july_0107'}]),limit:50});
  let kept=0,deleted=0;
  for(const c of (camps.data||[]).sort((a,b)=>a.name.localeCompare(b.name))){
    console.log('###',c.name);
    for(const a of (c.adsets&&c.adsets.data||[])){
      const i=a.name.split('_').pop();              // group index 1..4
      const keep=`0107_video${i}`;
      for(const ad of (a.ads&&a.ads.data||[])){
        if(ad.name===keep){ console.log(`  keep  ${a.name} -> ${ad.name}`); kept++; }
        else { const r=await del(ad.id); console.log(`  del   ${a.name} -> ${ad.name} ${r.success===true?'':JSON.stringify(r)}`); deleted++; }
      }
    }
  }
  console.log(`\nkept ${kept}, deleted ${deleted}`);
})().catch(e=>console.error('ERR',e.message));
