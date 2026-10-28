self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function activeUser(){return new Promise(resolve=>{const request=indexedDB.open('schulportal-push',1);request.onupgradeneeded=()=>request.result.createObjectStore('context');request.onerror=()=>resolve(null);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('context','readonly'),value=transaction.objectStore('context').get('active-user');transaction.oncomplete=()=>{db.close();resolve(value.result);};transaction.onerror=()=>{db.close();resolve(null);};};});}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!data.userId||await activeUser()!==data.userId)return;
 await self.registration.showNotification('Hausaufgaben für morgen',{body:String(data.body||'Prüfe deine offenen Aufgaben.').slice(0,300),tag:String(data.tag||'homework-reminder'),icon:new URL('assets/homework-icon.png',self.registration.scope).href,data:{userId:data.userId}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 if(await activeUser()!==event.notification.data?.userId)return;
 const url=new URL('hausaufgaben',self.registration.scope).href;
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const client=clients.find(client=>client.url.startsWith(self.registration.scope));
 if(client){await client.navigate(url);await client.focus();}else await self.clients.openWindow(url);
})());});
