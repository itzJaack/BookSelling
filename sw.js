/* Nessuna cache delle pagine o dei link privati. */
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const base=new URL(self.registration.scope);
  let target=new URL("richiesta.html",base);
  try{const url=new URL(data.url);if(url.origin===base.origin&&[new URL("admin.html",base).pathname,new URL("richiesta.html",base).pathname].includes(url.pathname)){url.hash="";target=url;}}catch{}
  event.waitUntil(self.registration.showNotification(data.title||"Seconda",{body:data.body||"Hai un nuovo aggiornamento.",icon:new URL("icons/icon-512.png",base).href,badge:new URL("icons/icon-192.png",base).href,tag:data.tag||"seconda",data:{url:target.href}}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL(event.notification.data.url),windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    // Non navigare una conversazione aperta: potrebbe contenere un messaggio non inviato.
    const exact=windows.find(client=>client.url===target.href);
    if(exact)return exact.focus();
    return self.clients.openWindow(target.href);
  })());
});
