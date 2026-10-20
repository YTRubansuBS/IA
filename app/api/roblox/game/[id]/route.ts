import { NextResponse } from "next/server";

type Series={time:string;value:number};
const METRICS=[
  ["dau","DailyActiveUsers","OneDay",null],
  ["playtimeHours","TotalPlayTimeHours","OneDay",null],
  ["avgPlaytime","AveragePlayTimeMinutesPerDAU","OneDay",null],
  ["avgSession","AverageSessionLengthMinutes","OneDay",null],
  ["sessions","Visits","OneDay",null],
  ["revenue","DailyRevenue","OneDay",null],
  ["d1","ForwardD1Retention","OneDay",null],
  ["d7","ForwardD7Retention","OneDay",null],
  ["payingUsers","PayingUsers","OneDay",null],
  ["payerCVR","PayingUsersCVR","OneDay",null],
] as const;

const ACQ=[
  ["UniqueUsersWithImpressions","impressions"],
  ["UniqueUsersWithClicks","clicks"],
  ["UniqueUsersWithPlaySessions","plays"],
  ["ImpressionCVR","impressionCTR"],
  ["EndToEndCVR","playRate"],
] as const;

const RFY=[
  ["RFYPlayThroughRate","ptr"],["RFYDuration0To60","bounce0to60"],["RFYDuration61To180","bounce61to180"],
  ["RFYD1Playtime","d1Playtime"],["RFYD2To7Playtime","d2to7Playtime"],["RFYD8To28Playtime","d8to28Playtime"],
  ["RFYD1PlayDays","d1PlayDays"],["RFYD2To7PlayDays","d2to7PlayDays"],["RFYD8To28PlayDays","d8to28PlayDays"],
  ["RFYD1CoplayDays","d1Coplay"],["RFYD2To7CoplayDays","d2to7Coplay"],["RFYD8To28CoplayDays","d8to28Coplay"],
  ["RFYD1QualifiedPlaySessions","d1Qualified"],["RFYD2To7QualifiedPlaySessions","d2to7Qualified"],["RFYD8To28QualifiedPlaySessions","d8to28Qualified"],
  ["RFYD1RobuxSpend","d1Robux"],["RFYD2To7RobuxSpend","d2to7Robux"],["RFYD8To28RobuxSpend","d8to28Robux"],
] as const;

async function roblox(url:string, init?:RequestInit){
  const r=await fetch(url,{...init,cache:"no-store"});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(d?.message || `Roblox HTTP ${r.status}`);
  return d;
}
function key(id:string){return process.env[`ROBLOX_API_KEY_${id}`]||process.env.ROBLOX_API_KEY||""}
function dates(days:number){const end=new Date();end.setUTCHours(0,0,0,0);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days);return {start:start.toISOString(),end:end.toISOString()}}
async function query(universe:string,apiKey:string,metric:string,granularity:string,startTime:string,endTime:string,breakdown?:string[],limit?:number){
  const body:any={metric,granularity,startTime,endTime}; if(breakdown) body.breakdown=breakdown; if(limit) body.limit=limit;
  let r=await fetch(`https://apis.roblox.com/analytics-query-api/v1/universes/${universe}/metrics`,{method:"POST",headers:{"x-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  let d=await r.json().catch(()=>null); if(!r.ok) throw new Error(d?.message||`Analytics HTTP ${r.status}`);
  if(d?.done===false && d?.path){
    for(let i=0;i<15;i++){await new Promise(x=>setTimeout(x,500)); const p=await fetch(`https://apis.roblox.com/analytics-query-api/${d.path}`,{headers:{"x-api-key":apiKey},cache:"no-store"}); d=await p.json().catch(()=>null); if(d?.done) break}
  }
  return d?.response?.values || [];
}
function flat(values:any[]):Series[]{const s=values?.[0]?.dataPoints||[];return s.map((x:any)=>({time:x.time,value:Number(x.value)||0}))}
function one(values:any[]):number|null{const s=flat(values);return s.length?s[s.length-1].value:null}
async function metric(universe:string,keyv:string,name:string,granularity:string,dateset:any,breakdown?:string[]){
  try{return await query(universe,keyv,name,granularity,dateset.start,dateset.end,breakdown)}
  catch{return []}
}
function aggregate(values:any[],labelKey:string):{label:string;value:number}[]{return (values||[]).map(v=>({label:String(v.breakdowns?.[0] ?? "Inconnu"),value:Number(v.dataPoints?.[v.dataPoints.length-1]?.value)||0})).sort((a,b)=>b.value-a.value)}
async function build(universe:string,keyv:string,days:number){
  const d=dates(days);
  const metricResults=await Promise.all(METRICS.map(async ([key,name,g])=>[key,await metric(universe,keyv,name,g,d)] as const));
  const stats:any={dau:[],playtimeHours:[],avgPlaytime:[],avgSession:[],sessions:[],revenue:[],d1:[],d7:[],payingUsers:[],payerCVR:[],acquisition:[],platforms:[],countries:[],ages:[],newReturning:[],rfy:{}};
  for(const [k,v] of metricResults) stats[k]=flat(v as any[]);
  stats.mau=one(await metric(universe,keyv,"MonthlyActiveUsers","OneDay",d));
  const breakdowns=await Promise.all([
    metric(universe,keyv,"DailyActiveUsers","None",d,["Platform"]),
    metric(universe,keyv,"DailyActiveUsers","None",d,["Country"]),
    metric(universe,keyv,"DailyActiveUsers","None",d,["AgeGroupV2"]),
    metric(universe,keyv,"DailyActiveUsers","None",d,["IsNewUser"])
  ]);
  stats.platforms=aggregate(breakdowns[0],"Platform"); stats.countries=aggregate(breakdowns[1],"Country"); stats.ages=aggregate(breakdowns[2],"AgeGroupV2");
  stats.newReturning=breakdowns[3].map((v:any)=>({label:String(v.breakdowns?.[0] ?? "Inconnu"),value:Number(v.dataPoints?.[0]?.value)||0}));
  const sources=["Home recommendations","Continue play","Today's Picks","Home other","Friends","Search","Charts","Sponsored ads","Search ads","Portal ads","Teleport","Other"];
  const acq=await Promise.all(sources.map(async source=>{
    const filter=[{dimension:"AcquisitionSource",values:[source],operation:"In"}];
    const [imp,clk,plays,ictr,rate]=await Promise.all(ACQ.map(async ([m])=>{try{return one(await query(universe,keyv,m,"None",d,["AcquisitionSource"],1))}catch{return null}}));
    return {source,impressions:imp||0,clicks:clk||0,plays:plays||0,impressionCTR:ictr,playRate:rate};
  }));
  stats.acquisition=acq;
  for(const [m,k] of RFY){try{stats.rfy[k]=one(await metric(universe,keyv,m,"OneDay",d))}catch{stats.rfy[k]=null}}
  return stats;
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const apiKey=key(id);
  if(!apiKey)return NextResponse.json({error:"Clé Roblox Open Cloud absente pour ce compte."},{status:503});
  const days=Math.min(365,Math.max(1,Number(new URL(req.url).searchParams.get("days")||30)));
  try{return NextResponse.json({stats:await build(id,apiKey,days)})}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Analytics Roblox indisponibles"},{status:502})}
}
