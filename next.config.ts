import type { NextConfig } from 'next';
import {initOpenNextCloudflareForDev} from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
const config: NextConfig = { output: 'standalone', poweredByHeader: false, devIndicators:false, async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}];} };
export default config;
