import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import Pos from '@/components/pos';
export default async function PosPage(){const user=await currentUser();if(!user)redirect('/login');if(!can(user.role,'sell'))redirect('/admin/dashboard');return <Pos userId={user.id}/>;}
