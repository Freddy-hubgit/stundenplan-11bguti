export interface NativeRelease{version:string;downloadUrl:string;}
export function appVersion(value:unknown):string|null{
 if(typeof value!=='string')return null;const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);return match&&match.slice(1).every(n=>Number.isSafeInteger(Number(n)))?match.slice(1).map(Number).join('.'):null;
}
export function newerAppVersion(remote:string,current:string):boolean{const a=remote.split('.').map(Number),b=current.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
export function nativeRelease(data:any):NativeRelease|null{
 const version=appVersion(data?.tag_name);if(!version||data?.draft!==false||data?.prerelease!==false||!Array.isArray(data.assets))return null;
 const asset=data.assets.find((a:any)=>{
  if(typeof a?.name!=='string'||!/setup.*\.exe$/i.test(a.name)||a.state!=='uploaded'||!(a.size>0)||typeof a.browser_download_url!=='string')return false;
  try{const url=new URL(a.browser_download_url);return url.protocol==='https:'&&url.host==='github.com'&&!url.username&&!url.password&&url.pathname.toLowerCase().startsWith('/freddy-hubgit/stundenplan-app/releases/download/');}catch{return false;}
 });return asset?{version,downloadUrl:asset.browser_download_url}:null;
}
