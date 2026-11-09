/** Share only pending GETs within one mounted app. Completed values are never
 * cached; every write invalidates pending reuse before it starts. */
export function createInflightRequests(){
 const pending=new Map();
 return {
  read(key,load){
   if(pending.has(key))return pending.get(key);
   const request=Promise.resolve().then(load);pending.set(key,request);
   const release=()=>{if(pending.get(key)===request)pending.delete(key);};
   request.then(release,release);return request;
  },
  invalidate(){pending.clear();}
 };
}
