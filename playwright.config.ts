import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:60000,use:{baseURL:'http://localhost:3000',headless:true,viewport:{width:1366,height:768},launchOptions:{channel:'chrome'}},reporter:'list'});
