import { NextResponse } from "next/server";

type Series={time:string;value:number};
const METRICS=[
  ["dau","DailyActiveUsers","OneDay"],["playtimeHours","TotalPlayTimeHours","OneDay"],
  ["avgPlaytime","AveragePlayTimeMinutesPerDAU","OneDay"],["avgSession","AverageSessionLengthMinutes","OneDay"],
  ["sessions","Visits","OneDay"],["revenue","DailyRevenue","OneDay"],["d1","ForwardD1Retention","OneDay"],
  ["d7","ForwardD7Retention","OneDay"],["payingUsers","PayingUsers","OneDay"],["payerCVR","PayingUsersCVR","OneDay"]
] as const;
const RFY=[
  ["RFYPlayThroughRate","ptr"],["RFYDuration0To60","bounce0to60"],["RFYDuration61To180","bounce61to180"],
  ["RFYD1Playtime","d1Playtime"],["RFYD2To7Playtime","d2to7Playtime"],["RFYD8To28Playtime","d8to28Playtime"],
  ["RFYD1PlayDays","d1PlayDays"],["RFYD2To7PlayDays","d2to7PlayDays"],["RFYD8To28PlayDays","d8to28PlayDays"],
  ["RFYD1CoplayDays","d1Coplay"],["RFYD2To7CoplayDays","d2to7Coplay"],["RFYD8To28CoplayDays","d8to28Coplay"],
  ["RFYD1QualifiedPlaySessions","d1Qualified"],["RFYD2To7QualifiedPlaySessions","d2to7Qualified"],["RFYD8To28QualifiedPlaySessions","d8to28Qualified"],
  ["RFYD1RobuxSpend","d1Robux"],["RFYD2To7RobuxSpend","d2to7Robux"],["RFYD8To28RobuxSpend","d8to28Robux"]
] as const;
const SOURCES=["Home recommendations","Continue play","Today's Picks","Home other","Friends","Search","Charts","Sponsored ads","Search ads","Portal ads","Teleport","Other"];
async function query(universe:string,keyv:string,metric:string,granularity:string,startTime:string,endTime:string,breakdown?:string[],limit?:number){
  const body:any={metric,granularity,startTime,endTime}; if(breakdown)body.breakdown=breakdown;if(limit)body.limit=limit;
  const r=await fetch(`https://apis.roblox.com/analytics-query-api/v1/universes/${universe}/metrics`,{method:"POST",headers:{"x-api-key":keyv,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  let d=await r.json().catch(()=>null); if(!r.ok)throw new Error(d?.message||`Analytics HTTP ${r.status}`);
  if(d?.done===false&&d?.path)for(let i=0;i<15&&!d.done;i++){await new Promise(x=>setTimeout(x,500));const p=await fetch(`https://apis.roblox.com/analytics-query-api/${d.path}`,{headers:{"x-api-key":keyv},cache:"no-store"});d=await p.json().catch(()=>null)}
  return d?.response?.values||[];
}
function flat(v:any[]):Series[]{return (v?.[0]?.dataPoints||[]).map((x:any)=>({time:x.time,value:Number(x.value)||0}))}
function one(v:any[]):number|null{const s=flat(v);return s.length?s[s.length-1].value:null}
function breakdown(v:any[]){return (v||[]).map(x=>({label:String(x.breakdowns?.[0]??"Inconnu"),value:Number(x.dataPoints?.[x.dataPoints.length-1]?.value)||0})).sort((a,b)=>b.value-a.value)}
async function safe(universe:string,keyv:string,m:string,g:string,d:any,b?:string[]){try{return await query(universe,keyv,m,g,d.start,d.end,b)}catch{return []}}
function dates(days:number){const end=new Date();end.setUTCHours(0,0,0,0);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days);return{start:start.toISOString(),end:end.toISOString()}}
function latestMap(v:any[]){const out:Record<string,number>={};for(const x of v||[]){const label=String(x.breakdowns?.[0]??"Other");out[label]=Number(x.dataPoints?.[x.dataPoints.length-1]?.value)||0}return out}
function keyFor(id:string){return process.env[`ROBLOX_API_KEY_${id}`]||process.env.ROBLOX_API_KEY||""}
async function build(universe:string,keyv:string,days:number){
  const d=dates(days);const stats:any={dau:[],playtimeHours:[],avgPlaytime:[],avgSession:[],sessions:[],revenue:[],d1:[],d7:[],payingUsers:[],payerCVR:[],acquisition:[],platforms:[],countries:[],ages:[],newReturning:[],rfy:{}};
  const main=await Promise.all(METRICS.map(async([k,m,g])=>[k,flat(await safe(universe,keyv,m,g,d))] as const));
  for(const[k,v]of main)stats[k]=v;
  stats.mau=one(await safe(universe,keyv,"MonthlyActiveUsers","OneDay",d));
  const [platform,country,age,newRet]=await Promise.all([
    safe(universe,keyv,"DailyActiveUsers","None",d,["Platform"]),
    safe(universe,keyv,"DailyActiveUsers","None",d,["Country"]),
    safe(universe,keyv,"DailyActiveUsers","None",d,["AgeGroupV2"]),
    safe(universe,keyv,"DailyActiveUsers","None",d,["IsNewUser"])
  ]);
  stats.platforms=breakdown(platform);stats.countries=breakdown(country);stats.ages=breakdown(age);stats.newReturning=breakdown(newRet);
  const [imps,clicks,plays,ctr,rate]=await Promise.all([
    safe(universe,keyv,"UniqueUsersWithImpressions","None",d,["AcquisitionSource"]),
    safe(universe,keyv,"UniqueUsersWithClicks","None",d,["AcquisitionSource"]),
    safe(universe,keyv,"UniqueUsersWithPlaySessions","None",d,["AcquisitionSource"]),
    safe(universe,keyv,"ImpressionCVR","None",d,["AcquisitionSource"]),
    safe(universe,keyv,"EndToEndCVR","None",d,["AcquisitionSource"])
  ]);
  const I=latestMap(imps),C=latestMap(clicks),P=latestMap(plays),CTR=latestMap(ctr),RATE=latestMap(rate);
  stats.acquisition=SOURCES.map(source=>({source,impressions:I[source]||0,clicks:C[source]||0,plays:P[source]||0,impressionCTR:CTR[source]??null,playRate:RATE[source]??null}));
  for(const[m,k]of RFY)stats.rfy[k]=one(await safe(universe,keyv,m,"OneDay",d));
  return stats;
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const{ id }=await params;const apiKey=keyFor(id);
  if(!apiKey)return NextResponse.json({error:"Clé Roblox Open Cloud absente pour ce compte."},{status:503});
  const days=Math.min(365,Math.max(1,Number(new URL(req.url).searchParams.get("days")||30)));
  try{return NextResponse.json({stats:await build(id,apiKey,days)})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Analytics Roblox indisponibles"},{status:502})}
}
