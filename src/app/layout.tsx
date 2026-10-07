import type {Metadata} from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './design-system.css';
import './pos-theme.css';
const interfaceFont=localFont({src:'../../public/fonts/NotoSansThai.ttf',weight:'100 900',style:'normal',display:'swap',variable:'--font-interface',fallback:['Tahoma','Arial']});
export const metadata:Metadata={title:'CIDA POS · ทัณฑสถานบำบัดพิเศษกลาง',description:'ระบบจำหน่ายสินค้าและอาหาร ทัณฑสถานบำบัดพิเศษกลาง',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th" className={interfaceFont.variable}><body>{children}</body></html>;}
