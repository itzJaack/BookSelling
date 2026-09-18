/* global supabase */
window.SecondaPush = (() => {
  const config = window.SUPABASE_CONFIG || {};
  const endpoint = `${config.url}/functions/v1/push-notifications`;
  let preparation;
  const supported = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  async function prepare() {
    if (!preparation) preparation = (async () => {
      const response = await fetch(endpoint, {signal:AbortSignal.timeout(15000),cache:"no-store"});
      if (!response.ok) throw new Error("Servizio notifiche non disponibile. Ricarica la pagina per riprovare.");
      const { publicKey } = await response.json();
      if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey || "")) throw new Error("Notifiche non ancora configurate.");
      const registration = await navigator.serviceWorker.register(new URL("sw.js",location.href), {scope:new URL("./",location.href).pathname});
      await navigator.serviceWorker.ready;
      return {registration,publicKey};
    })().catch(error => {preparation=null;throw error;});
    return preparation;
  }
  async function request(db, context, action, sub) {
    let token = config.anonKey;
    if (context.recipient === "admin") {
      const { data } = await db.auth.getSession();
      if (!data.session) throw new Error("Accedi di nuovo per gestire le notifiche.");
      token = data.session.access_token;
    }
    const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json",apikey:config.anonKey,Authorization:`Bearer ${token}`},body:JSON.stringify({...context,action,subscription:sub.toJSON()}),signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Operazione non riuscita.");
    return data;
  }
  async function disable(db, context) {
    if (!supported()) return;
    const registration = await navigator.serviceWorker.getRegistration(new URL("./",location.href));
    const sub = await registration?.pushManager.getSubscription();
    if (sub) await request(db,context,"unsubscribe",sub);
    // Una stessa iscrizione può servire altre richieste: rimuovere solo il legame corrente.
  }
  function mount(root, db, context) {
    let active=false,alive=true,busy=false,ready=null;
    root.innerHTML='<div class="rounded-xl border border-neutral-200 bg-white p-4"><p class="text-sm font-medium">Notifiche sul telefono</p><p data-push-info class="mt-1 text-xs leading-5 text-neutral-500"></p><div class="mt-3 flex flex-wrap gap-2"><button data-push-enable type="button" disabled class="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium disabled:opacity-50">Attiva notifiche</button><button data-push-test type="button" hidden class="rounded-lg border border-neutral-300 px-3 py-2 text-xs disabled:opacity-50">Invia una prova</button></div><p data-push-status class="mt-2 text-xs leading-5 text-neutral-600" role="status"></p></div>';
    const $=s=>root.querySelector(s),button=$("[data-push-enable]"),test=$("[data-push-test]"),status=$("[data-push-status]");
    $("[data-push-info]").textContent=context.recipient==="admin"?"Ricevi nuove offerte e messaggi anche a sito chiuso. L’uscita dall’account disattiva gli avvisi admin su questo browser.":"Ricevi gli avvisi per questa richiesta anche a sito chiuso. Attivali separatamente per ogni richiesta e dispositivo.";
    const render=()=>{if(!alive)return;button.textContent=active?"Disattiva notifiche":"Attiva notifiche";button.disabled=busy||!ready;test.hidden=!active;test.disabled=busy;};
    const fail=error=>{if(alive)status.textContent=error.message||"Operazione non riuscita. Riprova.";};
    if (ios()&&!installed()) {
      status.textContent="Su iPhone/iPad: apri il sito in Safari → Condividi → Aggiungi alla schermata Home. Aprilo dall’icona, poi attiva le notifiche (iOS 16.4 o successivo). Per una richiesta, conserva il link privato e incollalo nell’app se non compare.";
    } else if (!supported()) {
      status.textContent="Questo browser non supporta le notifiche push. Prova un browser aggiornato sul telefono.";
    } else {
      status.textContent="Preparazione notifiche…";
      prepare().then(async result=>{ready=result;const sub=await ready.registration.pushManager.getSubscription();if(sub)active=(await request(db,context,"status",sub)).active;if(alive)status.textContent=active?"Notifiche attive su questo dispositivo.":Notification.permission==="denied"?"Notifiche bloccate: riabilitale nelle impostazioni del browser o del telefono.":"Attivazione facoltativa. Gli avvisi vengono inviati di norma entro un minuto; rete e impostazioni del telefono possono ritardarli.";}).catch(fail).finally(render);
    }
    button.addEventListener("click",async()=>{
      if(busy||!ready)return;busy=true;render();
      try {
        if(active){await disable(db,context);active=false;if(alive)status.textContent="Notifiche disattivate per questa area su questo dispositivo.";}
        else {
          // Richiesto direttamente dal clic, prima di qualsiasi richiesta di rete.
          const permission=await Notification.requestPermission();
          if(permission!=="granted")throw new Error("Permesso non concesso. Puoi riabilitare le notifiche dalle impostazioni del browser.");
          let sub=await ready.registration.pushManager.getSubscription();
          if(!sub){const key=Uint8Array.from(atob(ready.publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));sub=await ready.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
          await request(db,context,"subscribe",sub);active=true;if(alive)status.textContent="Notifiche attive. Usa ‘Invia una prova’ per controllare la ricezione sul telefono.";
        }
      }catch(error){fail(error);}finally{busy=false;render();}
    });
    test.addEventListener("click",async()=>{
      if(busy||!active)return;busy=true;render();
      try{const sub=await ready.registration.pushManager.getSubscription();if(!sub)throw new Error("Iscrizione scaduta: disattiva e riattiva le notifiche.");await request(db,context,"test",sub);if(alive)status.textContent="Prova in coda: dovrebbe arrivare entro un minuto. Una prova al minuto per dispositivo.";}catch(error){fail(error);}finally{busy=false;render();}
    });
    return {close(){alive=false;root.replaceChildren();},disable:()=>disable(db,context)};
  }
  return {mount,disable};
})();
