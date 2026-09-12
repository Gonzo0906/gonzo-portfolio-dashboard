import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./scripts/ui',timeout:30000,use:{baseURL:'http://127.0.0.1:8000',headless:true},webServer:{command:'python3 -m http.server 8000 --directory public',url:'http://127.0.0.1:8000',reuseExistingServer:!process.env.CI},reporter:'list'});
