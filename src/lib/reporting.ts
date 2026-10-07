import type {Settings} from './config';
import type {summarize} from './domain';

export type Summary=ReturnType<typeof summarize>;
export type DailyTrend={date:string;total:number;count:number};
export type SalesReport={
 date:string;from:string;to:string;config:Settings;summary:Summary;
 day:{closed:boolean}|null;filters:boolean;generatedAt:string;trend?:DailyTrend[];
 closings:{id:string;revision:number;createdAt:string;expectedCash:number;actualCash:number;difference:number;note:string;summary:Summary}[];
 users:{id:string;name:string}[];terminals:{id:string;name:string}[];
};
export function reportDates(end:string,count:7|30){
 const last=new Date(`${end}T12:00:00Z`).getTime();
 return Array.from({length:count},(_,i)=>new Date(last-(count-1-i)*86400000).toISOString().slice(0,10));
}
export function reportDate(date:string){return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium'}).format(new Date(`${date}T12:00:00Z`));}
