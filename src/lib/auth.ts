import { cookies } from 'next/headers';
import { randomBytes, createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { db } from './db';
import { can, type Permission } from './permissions';
export class AppError extends Error { constructor(message:string,public status=400){super(message);} }
export const hash = (value:string)=>createHash('sha256').update(value).digest('hex');
export type Actor={id:string;name:string;role:string;username:string};
export async function currentUser():Promise<Actor|null>{
  const token=(await cookies()).get('cida_session')?.value;
  if(!token)return null;
  const session=await db.session.findUnique({where:{id:hash(token)},include:{user:true}});
  if(!session || session.expiresAt<new Date() || !session.user.active)return null;
  const {id,name,role,username}=session.user;return {id,name,role,username};
}
export async function requireUser(permission?:Permission){const user=await currentUser();if(!user)throw new AppError('กรุณาเข้าสู่ระบบ',401);if(permission&&!can(user.role,permission))throw new AppError('คุณไม่มีสิทธิ์ใช้งานส่วนนี้',403);return user;}
export function checkOrigin(request:Request){const origin=request.headers.get('origin');const expected=process.env.APP_ORIGIN??new URL(request.url).origin;if(origin!==expected)throw new AppError('คำขอไม่ได้มาจากระบบ POS นี้',403);}
export async function login(username:string,password:string,ip:string){
  const key=hash(username.toLowerCase()),now=new Date();
  const attempt=await db.loginAttempt.upsert({where:{key},create:{key,count:1,resetAt:new Date(now.getTime()+900000)},update:{count:{increment:1}}});
  if(attempt.resetAt<now)await db.loginAttempt.update({where:{key},data:{count:1,resetAt:new Date(now.getTime()+900000)}});
  else if(attempt.count>10)throw new AppError('เข้าสู่ระบบผิดพลาดหลายครั้ง กรุณารอ 15 นาที',429);
  const user=await db.user.findUnique({where:{username}});
  const valid=await compare(password,user?.passwordHash??'$2b$12$5OpyVCm2DEClmcRNMpXHFuVteUwVeidZYr8SVkj/I58PhEfq.sxjK');
  if(!user?.active||!valid)throw new AppError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',401);
  await db.loginAttempt.deleteMany({where:{key}});
  const token=randomBytes(32).toString('hex');
  await db.$transaction(async tx=>{await tx.session.create({data:{id:hash(token),userId:user.id,expiresAt:new Date(now.getTime()+8*3600000)}});await tx.auditLog.create({data:{userId:user.id,userName:user.name,action:'LOGIN',entity:'Session',entityId:hash(token),context:ip}});});
  (await cookies()).set('cida_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:8*3600});
  return {id:user.id,name:user.name,role:user.role,username:user.username};
}
export async function logout(){const user=await currentUser(),jar=await cookies(),token=jar.get('cida_session')?.value;if(token)await db.$transaction(async tx=>{await tx.session.deleteMany({where:{id:hash(token)}});if(user)await tx.auditLog.create({data:{userId:user.id,userName:user.name,action:'LOGOUT',entity:'Session',entityId:hash(token)}});});jar.delete('cida_session');}
