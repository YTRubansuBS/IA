import { NextResponse } from "next/server";

type Series={time:string;value:number};
type QueryResult={values:any[]};

const CORE=[["dau","DailyActiveUsers"],["playtimeHours","TotalPlayTimeHours"],["avgPlaytime","AveragePlayTimeMinutesPerDAU"],["avgSession","AverageSessionLengthMinutes"],["sessions","Visits"],["revenue","DailyRevenue"],["d1","ForwardD1Retention"],["d7","ForwardD7Retention"]] as const;
const MONETIZATION=[["payingUsers","PayingUsers"],["payerCVR","PayingUsersCVR"],["arpdau","AverageRevenuePerUser"],["arppu","AverageRevenuePerPayingUser"]] as const;
const ADVANCED=[["d30","ForwardD30Retention"],["totalSessionsEnded","TotalSessionsEndedInBucket"]] as const;

const cache=new Map<string,{expires:number;data:any}>();
const CACHE_MS=90000;

function granularity(days:number,metric:string){
  if(["ForwardD1Retention","ForwardD7Retention","ForwardD30Retention","MonthlyActiveUsers"].includes(metric)) return "OneDay";
  if(days<=90)return"OneDay";
  return"OneMonth";
}
function dates(days:number){const end=new Date();end.setUTCHours(0,0,0,0);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days);return{start:start.toISOString(),end:end.toISOString()};}
async function query(universe:string,key:string,metric:string,gran:string,start:string,end:string,breakdown?:string[]){
  const body:any={metric,granularity:gran,startTime:start,endTime:end};if(breakdown)body.breakdown=breakdown;
  for(let attempt=0;attempt<3;attempt++){
    const r=await fetch(`https://apis.roblox.com/analytics-query-api/v1/universes/${universe}/metrics`,{method:"POST",headers:{"x-api-key":key,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
    let data:any=await r.json().catch(()=>null);
    if(r.status===429&&attempt<2){const wait=Math.min(Math.max(Number(r.headers.get("retry-after")||"2"),1),10);await new Promise(x=>setTimeout(x,wait*1000));continue;}
    if(!r.ok){const detail=typeof data==="string"?data:(data?.message||data?.error||data?.code||data?.details||JSON.stringify(data));throw new Error(`${metric}: Roblox Analytics HTTP ${r.status} — ${detail}`);}
    if(data?.done===false&&data?.path){
      for(let i=0;i<30&&!data.done;i++){await new Promise(x=>setTimeout(x,500));const p=await fetch(`https://apis.roblox.com/analytics-query-api/${data.path}`,{headers:{"x-api-key":key},cache:"no-store"});data=await p.json().catch(()=>null);if(!p.ok)throw new Error(`${metric}: Roblox Analytics polling HTTP ${p.status}`);}
      if(!data?.done)throw new Error(`${metric}: requête Roblox Analytics trop longue`);
    }
    return{values:data?.response?.values||[]};
  }
  throw new Error(`${metric}: Roblox Analytics HTTP 429 — limite temporaire atteinte`);
}
function flat(values:any[]):Series[]{return(values?.[0]?.dataPoints||[]).map((p:any)=>({time:p.time,value:Number(p.value)||0}));}
function one(values:any[]):number|null{const s=flat(values);return s.length?s[s.length-1].value:null;}
function breakdown(values:any[]){return(values||[]).map((x:any)=>({label:String(x.breakdowns?.[0]?.displayValue??x.breakdowns?.[0]?.value??"Inconnu"),value:Number(x.dataPoints?.at(-1)?.value)||0})).sort((a,b)=>b.value-a.value);}
async function safe(universe:string,key:string,metric:string,days:number,range:any,errors:string[],breakdown?:string[]){try{return await query(universe,key,metric,granularity(days,metric),range.start,range.end,breakdown)}catch(e){errors.push(e instanceof Error?e.message:String(e));return{values:[]};}}
function keyFor(id:string){return process.env[`ROBLOX_API_KEY_${id}`]||process.env.ROBLOX_API_KEY||"";}

async function build(universe:string,key:string,days:number,section:string){
  const range=dates(days),errors:string[]=[];
  const defs=section==="monetization"?MONETIZATION:section==="advanced"?ADVANCED:CORE;
  const stats:any={};
  for(const [name,metric] of defs){const result=await safe(universe,key,metric,days,range,errors);stats[name]=flat(result.values);}
  if(section==="overview"){const mau=await safe(universe,key,"MonthlyActiveUsers",days,range,errors);stats.mau=one(mau.values);}
  if(section==="audience"){
    const [platform,country,age,newReturning]=await Promise.all([
      safe(universe,key,"DailyActiveUsers",days,range,errors,["Platform"]),
      safe(universe,key,"DailyActiveUsers",days,range,errors,["Country"]),
      safe(universe,key,"DailyActiveUsers",days,range,errors,["AgeGroupV2"]),
      safe(universe,key,"DailyActiveUsers",days,range,errors,["IsNewUser"])
    ]);
    stats.platforms=breakdown(platform.values);stats.countries=breakdown(country.values);stats.ages=breakdown(age.values);stats.newReturning=breakdown(newReturning.values);
  }
  if(section==="acquisition"){
    const [impressions,clicks,plays,ctr,rate]=await Promise.all([
      safe(universe,key,"UniqueUsersWithImpressions",days,range,errors,["AcquisitionSource"]),
      safe(universe,key,"UniqueUsersWithClicks",days,range,errors,["AcquisitionSource"]),
      safe(universe,key,"UniqueUsersWithPlaySessions",days,range,errors,["AcquisitionSource"]),
      safe(universe,key,"ImpressionCVR",days,range,errors,["AcquisitionSource"]),
      safe(universe,key,"EndToEndCVR",days,range,errors,["AcquisitionSource"])
    ]);
    const latest=(values:any[])=>{const o:Record<string,number>={};for(const x of values||[]){const b=x.breakdowns?.[0];const k=String(b?.displayValue??b?.value??"Other");o[k]=Number(x.dataPoints?.at(-1)?.value)||0;}return o;};
    const I=latest(impressions.values),C=latest(clicks.values),P=latest(plays.values),CTR=latest(ctr.values),RATE=latest(rate.values);
    stats.acquisition=Array.from(new Set([...Object.keys(I),...Object.keys(C),...Object.keys(P)])).map(source=>({source,impressions:I[source]||0,clicks:C[source]||0,plays:P[source]||0,impressionCTR:CTR[source]??null,playRate:RATE[source]??null})).sort((a,b)=>b.impressions-a.impressions);
  }
  return{stats,diagnostics:{universeId:universe,days,section,partialErrors:Array.from(new Set(errors)),apiKeyConfigured:true}};
}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const{id}=await params,key=keyFor(id);if(!key)return NextResponse.json({error:"Clé Roblox Open Cloud absente.",code:"ROBLOX_API_KEY_MISSING"},{status:503});
  const u=new URL(req.url),days=Math.min(365,Math.max(1,Number(u.searchParams.get("days")||30))),section=u.searchParams.get("section")||"overview";
  const allowed=["overview","audience","acquisition","monetization","advanced"],safeSection=allowed.includes(section)?section:"overview",cacheKey=`${id}:${days}:${safeSection}`,cached=cache.get(cacheKey);
  if(cached&&cached.expires>Date.now())return NextResponse.json(cached.data);
  try{const data=await build(id,key,days,safeSection);cache.set(cacheKey,{expires:Date.now()+CACHE_MS,data});return NextResponse.json(data);}
  catch(e){const message=e instanceof Error?e.message:"Analytics Roblox indisponibles";return NextResponse.json({error:message,code:"ROBLOX_ANALYTICS_REQUEST_FAILED",universeId:id,hint:message.includes("429")?"La période est automatiquement adaptée et les résultats sont mis en cache. Réessaie dans quelques secondes.":undefined},{status:502});}
}