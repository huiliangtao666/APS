// Isolated, replaceable simulation entry. Does not use any existing QA data directory.
import express from 'express';import fs from 'node:fs';import path from 'node:path';
import {createBusinessRouter} from '../server/business.mjs';
if(process.env.WORKBOOK_PRIVATE!=='1'||!process.env.WORKBOOK_STATE)throw Error('Explicit isolated workbook state required');
const state=process.env.WORKBOOK_STATE;fs.mkdirSync(state,{recursive:true});const app=express();app.use(express.json({limit:'20mb'}));
app.get('/api/workbook-deployment',(_req,res)=>res.json({productSha:process.env.WORKBOOK_PRODUCT_SHA||'UNCOMMITTED_SELFTEST',mode:'isolated explicit shared simulation',source:process.env.WORKBOOK_SOURCE_FINGERPRINT||null}));
app.use('/api',createBusinessRouter({dataDir:state,accessMode:'shared'}));app.use(express.static(path.join(state,'dist')));app.get('*',(_req,res)=>res.sendFile(path.join(state,'dist','index.html')));
const server=app.listen(Number(process.env.PORT||4320),'0.0.0.0');await new Promise(r=>server.once('listening',r));console.log('WORKBOOK_PRIVATE_READY');
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>process.exit(0)));
