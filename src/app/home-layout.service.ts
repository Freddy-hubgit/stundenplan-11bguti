import { Injectable } from '@angular/core';
export interface HomeTile { route: string; title: string; }
interface HomePreferences { order: string[]; hidden: string[]; colors: Record<string,string>; compact: boolean; }
@Injectable({providedIn:'root'})
export class HomeLayoutService {
 private account: string | null=null;
 preferences: HomePreferences=this.defaults();
 storageError='';
 readonly colors=[
  {key:'cyan',label:'Türkis',dark:'#70d9e5',light:'#146c7b',tint:'rgba(112,217,229,.10)'},
  {key:'blue',label:'Blau',dark:'#8cbbff',light:'#315f9f',tint:'rgba(140,187,255,.10)'},
  {key:'purple',label:'Violett',dark:'#b4a2f5',light:'#6c50b6',tint:'rgba(180,162,245,.10)'},
  {key:'rose',label:'Rosa',dark:'#f29cbe',light:'#a14770',tint:'rgba(242,156,190,.10)'},
  {key:'amber',label:'Gold',dark:'#f3bf75',light:'#94601b',tint:'rgba(243,191,117,.10)'},
  {key:'green',label:'Grün',dark:'#7bdbb2',light:'#227553',tint:'rgba(123,219,178,.10)'},
 ];
 private readonly routes=['/krankmeldung','/meldungen','/hausaufgaben','/nachrichten','/videokonferenz','/stundenplan','/kalender','/support','/vertretungsplan','/admin'];
 private defaults(): HomePreferences{return {order:[],hidden:[],colors:{},compact:false};}
 get ready():boolean{return !!this.account;}
 activate(account:string|null):void{
  this.account=account;this.preferences=this.defaults();this.storageError='';
  if(!account)return;
  try{
   const value=JSON.parse(localStorage.getItem('portal-home:'+account)||'null');if(!value||value.version!==1)return;
   const routes=(items:unknown)=>Array.isArray(items)?Array.from(new Set(items.filter(r=>typeof r==='string'&&this.routes.includes(r)))):[];
   const colors:Record<string,string>={};
   if(value.colors&&typeof value.colors==='object')this.routes.forEach(route=>{if(this.colors.some(c=>c.key===value.colors[route]))colors[route]=value.colors[route];});
   this.preferences={order:routes(value.order),hidden:routes(value.hidden),colors,compact:value.compact===true};
  }catch{this.storageError='Gespeicherte Einstellungen konnten nicht geladen werden. Du kannst sie neu festlegen.';}
 }
 private save():void{
  if(!this.account)return;
  try{localStorage.setItem('portal-home:'+this.account,JSON.stringify({version:1,...this.preferences}));this.storageError='';}
  catch{this.storageError='Die Änderungen gelten aktuell, konnten aber nicht in diesem Browser gespeichert werden.';}
 }
 ordered<T extends HomeTile>(tiles:ReadonlyArray<T>):T[]{
  const result=this.preferences.order.map(route=>tiles.find(tile=>tile.route===route)).filter((tile):tile is T=>!!tile);
  return [...result,...tiles.filter(tile=>!this.preferences.order.includes(tile.route))];
 }
 visible<T extends HomeTile>(tiles:ReadonlyArray<T>):T[]{return this.ordered(tiles).filter(tile=>!this.preferences.hidden.includes(tile.route));}
 move(tiles:ReadonlyArray<HomeTile>,route:string,offset:number):void{
  const list=this.ordered(tiles);const from=list.findIndex(tile=>tile.route===route);const to=from+offset;
  if(from<0||to<0||to>=list.length)return;this.moveTo(tiles,route,list[to].route);
 }
 moveTo(tiles:ReadonlyArray<HomeTile>,route:string,target:string):void{
  const list=this.ordered(tiles).map(t=>t.route),from=list.indexOf(route),to=list.indexOf(target);
  if(from<0||to<0||from===to)return;list.splice(from,1);list.splice(to,0,route);this.preferences.order=list;this.save();
 }
 hidden(route:string):boolean{return this.preferences.hidden.includes(route);}
 toggle(route:string):void{if(!this.routes.includes(route))return;this.preferences.hidden=this.hidden(route)?this.preferences.hidden.filter(r=>r!==route):[...this.preferences.hidden,route];this.save();}
 color(route:string):string{return this.preferences.colors[route]||'';}
 setColor(route:string,key:string):void{
  if(!this.routes.includes(route)||(!this.colors.some(c=>c.key===key)&&key!==''))return;
  if(key)this.preferences.colors[route]=key;else delete this.preferences.colors[route];this.save();
 }
 accent(route:string,light:boolean):string|null{const color=this.colors.find(c=>c.key===this.color(route));return color?(light?color.light:color.dark):null;}
 tint(route:string):string|null{return this.colors.find(c=>c.key===this.color(route))?.tint||null;}
 setCompact(value:boolean):void{this.preferences.compact=value;this.save();}
 reset():void{this.preferences=this.defaults();this.save();}
}
