import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import Admin from '@/components/admin';
export default async function AdminPage({params}:{params:Promise<{path?:string[]}>}){const user=await currentUser();if(!user)redirect('/login');if(!can(user.role,'reports.read')&&!can(user.role,'catalog.write'))redirect('/pos');const {path}=await params;if(path?.[0]==='snapshots')redirect('/admin/reports');if(path?.[0]==='sales-reset'&&!can(user.role,'sales.reset'))redirect('/admin/dashboard');return <Admin section={path?.[0]??'dashboard'} user={user}/>;}
