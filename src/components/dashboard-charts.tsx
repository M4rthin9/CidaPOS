'use client';
import {useState} from 'react';
import {Area,AreaChart,Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {money} from '@/lib/domain';
import {reportDate,type Summary,type DailyTrend} from '@/lib/reporting';
import {Empty} from './ui';

const palette=['#bd603b','#537eab','#64826a','#b77491','#a27245','#6e70aa'];
const shortAmount=(baht:number)=>new Intl.NumberFormat('th-TH',{notation:'compact',maximumFractionDigits:1}).format(baht);
export default function DashboardCharts({summary,trend,days,onDaysChange,loading,categoryColors}:{summary:Summary;trend:DailyTrend[];days:7|30;onDaysChange:(days:7|30)=>void;loading:boolean;categoryColors:Record<string,string>}){
 const [measure,setMeasure]=useState<'total'|'quantity'>('total');
 const colorFor=(id:string,index:number)=>categoryColors[id]??palette[index%palette.length];
 const categories=summary.categories.map((c,i)=>({...c,color:colorFor(c.id,i),value:measure==='total'?c.total/100:c.quantity})).sort((a,b)=>b.value-a.value);
 const positive=categories.filter(c=>c.total>0);
 const periodTotal=trend.reduce((sum,day)=>sum+day.total,0);
 const series=trend.map(day=>({...day,amount:day.total/100,label:new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short'}).format(new Date(`${day.date}T12:00:00Z`))}));
 return <div className="dashboard-chart-grid">
  <section className="panel trend-panel" aria-label="กราฟแนวโน้มยอดขายรายวัน">
   <div className="panel-title"><div><h2>แนวโน้มยอดขายรายวัน</h2><p>{trend.length?`${reportDate(trend[0].date)} – ${reportDate(trend.at(-1)!.date)}`:'กำลังโหลดแนวโน้ม'}</p></div><div className="chart-switch" aria-label="ช่วงเวลาของกราฟ">{([7,30] as const).map(value=><button key={value} aria-pressed={days===value} disabled={loading} onClick={()=>onDaysChange(value)}>{value} วัน</button>)}</div></div>
   <div className="trend-metrics"><span>รวมในช่วงนี้ <strong>฿{money(periodTotal)}</strong></span><span>เฉลี่ยต่อวัน <strong>฿{money(trend.length?Math.round(periodTotal/trend.length):0)}</strong></span><span>ยอดสุทธิหลังส่วนลดและคืนเงิน</span></div>
   <div className="trend-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={series} margin={{top:12,right:16,bottom:8,left:8}} accessibilityLayer>
    <defs><linearGradient id="daily-sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bd603b" stopOpacity={.25}/><stop offset="100%" stopColor="#bd603b" stopOpacity={.015}/></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="#e8e9e2" strokeDasharray="3 4"/>
    <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{fontSize:11,fill:'#747c6e'}}/>
    <YAxis axisLine={false} tickLine={false} tickFormatter={shortAmount} width={54} tick={{fontSize:11,fill:'#747c6e'}} domain={[0,'auto']}/>
    <Tooltip formatter={value=>[`฿${money(Math.round(Number(value)*100))}`,'ยอดขายสุทธิ']} labelFormatter={(_,payload)=>payload[0]?.payload?.date?reportDate(payload[0].payload.date):''} contentStyle={{borderRadius:10,border:'1px solid #e4e5dc',fontSize:12}}/>
    <Area type="monotone" dataKey="amount" stroke="#bd603b" strokeWidth={3} fill="url(#daily-sales-fill)" activeDot={{r:5,strokeWidth:3,stroke:'#fff'}} dot={days===7?{r:3,fill:'#bd603b',stroke:'#fff',strokeWidth:2}:false} isAnimationActive={false}/>
   </AreaChart></ResponsiveContainer></div>
   {periodTotal===0&&<p className="chart-footnote">ยังไม่มียอดขายในช่วงนี้ กราฟแสดงยอด 0 ของแต่ละวัน</p>}
  </section>
  <section className="panel category-chart-panel" aria-label="กราฟเปรียบเทียบหมวดสินค้า">
   <div className="panel-title"><div><h2>เปรียบเทียบหมวดสินค้า</h2><p>{measure==='total'?'ยอดขายสุทธิ (บาท)':'จำนวนชิ้นก่อนหักจำนวนคืน'}</p></div><div className="chart-switch" aria-label="ข้อมูลเปรียบเทียบหมวด">{(['total','quantity'] as const).map(value=><button key={value} aria-pressed={measure===value} onClick={()=>setMeasure(value)}>{value==='total'?'ยอดขาย':'จำนวน'}</button>)}</div></div>
   {categories.length?<><div className="category-bars" style={{height:Math.max(210,categories.length*52+40)}}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={categories} layout="vertical" margin={{top:0,right:24,bottom:8,left:0}} accessibilityLayer>
    <CartesianGrid horizontal={false} stroke="#ecece5" strokeDasharray="3 4"/>
    <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={shortAmount} tick={{fontSize:10}} allowDecimals={measure==='total'}/>
    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={116} tick={{fontSize:11,fill:'#5e6857'}}/>
    <Tooltip cursor={{fill:'#f5f5f0'}} formatter={value=>[measure==='total'?`฿${money(Math.round(Number(value)*100))}`:`${Number(value).toLocaleString()} ชิ้น`,measure==='total'?'ยอดขายสุทธิ':'จำนวนสินค้า']} contentStyle={{borderRadius:10,border:'1px solid #e4e5dc',fontSize:12}}/>
    <Bar dataKey="value" radius={[0,5,5,0]} barSize={20} isAnimationActive={false}>{categories.map(c=><Cell key={c.id} fill={c.color}/>)}</Bar>
   </BarChart></ResponsiveContainer></div><div className="chart-value-list">{categories.map(c=><div key={c.id}><span><i style={{background:c.color}}/>{c.name}</span><strong>{measure==='total'?`฿${money(c.total)}`:`${c.quantity.toLocaleString()} ชิ้น`}</strong></div>)}</div></>:<Empty text="ยังไม่มีหมวดสินค้า"/>}
  </section>
  <section className="panel share-chart-panel" aria-label="กราฟสัดส่วนรายได้ตามหมวด">
   <div className="panel-title"><div><h2>สัดส่วนรายได้ตามหมวด</h2><p>สัดส่วนจากยอดขายสุทธิของวันที่เลือก</p></div><span>{categories.length} หมวด</span></div>
   {summary.total>0?<><div className="sales-donut"><ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart accessibilityLayer><Pie data={positive} dataKey="total" nameKey="name" innerRadius={70} outerRadius={96} paddingAngle={positive.length>1?3:0} stroke="none" isAnimationActive={false}>{positive.map(c=><Cell key={c.id} fill={c.color}/>)}</Pie><Tooltip formatter={value=>`฿${money(Number(value))}`} contentStyle={{borderRadius:10,fontSize:12}}/></PieChart></ResponsiveContainer><div className="donut-center"><small>ยอดขายสุทธิ</small><strong>฿{money(summary.total)}</strong></div></div><div className="share-legend">{categories.map(c=><div key={c.id}><span><i style={{background:c.color}}/>{c.name}</span><strong>{(c.total/summary.total*100).toFixed(1)}%<small>฿{money(c.total)}</small></strong></div>)}</div></>:<Empty text="ยังไม่มียอดขายในวันที่เลือก"/>}
  </section>
 </div>;
}
