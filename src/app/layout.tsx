import type {Metadata} from 'next';
import './globals.css';
import './pos-theme.css';
export const metadata:Metadata={title:'CIDA POS · ทัณฑสถานบำบัดพิเศษกลาง',description:'ระบบจำหน่ายสินค้าและอาหาร ทัณฑสถานบำบัดพิเศษกลาง',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}
