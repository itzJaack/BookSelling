/* Invito all'installazione: prompt Android e guida manuale iPhone/iPad. */
(() => {
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(navigator.userAgent);
  const mode=window.matchMedia("(display-mode: standalone)");
  const standalone=()=>mode.matches||navigator.standalone===true;
  const storageKey="seconda-install-dismissed";
  let deferred=null,installed=false,banner=null,guide=null,footerButton=null;
  const dismissed=()=>{try{return Date.now()-Number(localStorage.getItem(storageKey)||0)<7*86400000;}catch{return false;}};
  const hide=()=>{banner?.remove();banner=null;};
  const later=()=>{try{localStorage.setItem(storageKey,String(Date.now()));}catch{}hide();};
  function showGuide(){
    if(!guide){
      guide=document.createElement("dialog");
      guide.className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-xl";
      guide.setAttribute("aria-labelledby","install-guide-title");
      guide.innerHTML=`<h2 id="install-guide-title" class="text-lg font-semibold">Seconda sulla schermata Home</h2><ol class="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6">${ios?'<li>Apri questa pagina in <strong>Safari</strong>.</li><li>Tocca <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong>.</li><li>Se compare l’opzione, lascia attivo <strong>Apri come app web</strong> e conferma con <strong>Aggiungi</strong>.</li>':'<li>Apri il sito in <strong>Chrome</strong> o in un browser compatibile.</li><li>Apri il menu <strong>⋮</strong> e scegli <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.</li><li>Conferma l’installazione.</li>'}</ol><p class="mt-4 text-xs leading-5 text-neutral-500">Poi apri Seconda dall’icona e premi “Attiva notifiche” nel pannello admin o nella tua conversazione.${ios?' Le notifiche su iPhone/iPad richiedono iOS 16.4 o successivo.':''}</p><p class="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5">Hai già fatto un’offerta? Conserva il link privato: potresti doverlo incollare in “Le mie richieste” dopo l’installazione.</p><button type="button" class="mt-5 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium">Ho capito</button>`;
      guide.querySelector("button").addEventListener("click",()=>guide.close());
      document.body.append(guide);
    }
    if(!guide.open)guide.showModal();
  }
  async function install(){
    if(standalone()||installed){hide();return;}
    if(!deferred){showGuide();return;}
    const prompt=deferred;deferred=null;
    try{
      // La finestra di sistema può essere aperta solo in risposta al clic.
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==="accepted")hide();else later();
    }catch{showGuide();}
  }
  function show(){
    if(banner||standalone()||installed||dismissed()||(!ios&&!android&&!deferred))return;
    banner=document.createElement("aside");
    banner.className="fixed bottom-4 left-4 right-4 z-40 rounded-xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-lg sm:left-auto sm:max-w-sm";
    banner.style.marginBottom="env(safe-area-inset-bottom, 0px)";
    banner.setAttribute("aria-label","Installa Seconda");
    banner.innerHTML='<div class="flex items-start gap-3"><span aria-hidden="true" class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-neutral-900 font-semibold text-white">S</span><div><p class="text-sm font-semibold">Aggiungi Seconda alla Home</p><p class="mt-1 text-xs leading-5 text-neutral-500">Apri il sito come un’app e attiva gli avvisi per offerte e messaggi.</p></div></div><div class="mt-3 flex gap-2"><button data-install type="button" class="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white">'+(ios?'Come aggiungerla':'Installa app')+'</button><button data-later type="button" class="rounded-lg border border-neutral-300 px-3 py-2 text-xs">Non ora</button></div>';
    banner.querySelector("[data-install]").addEventListener("click",install);
    banner.querySelector("[data-later]").addEventListener("click",later);
    document.body.append(banner);
  }
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferred=event;show();});
  window.addEventListener("appinstalled",()=>{installed=true;deferred=null;hide();guide?.close();if(footerButton)footerButton.hidden=true;});
  mode.addEventListener?.("change",()=>{if(standalone()){hide();guide?.close();if(footerButton)footerButton.hidden=true;}});
  if("serviceWorker" in navigator&&window.isSecureContext){navigator.serviceWorker.register(new URL("sw.js",location.href),{scope:new URL("./",location.href).pathname}).catch(()=>{/* La pagina rimane utilizzabile senza installazione. */});}
  if(!standalone()){
    const footer=document.createElement("div");footer.className="px-5 py-5 text-center";
    footerButton=document.createElement("button");footerButton.type="button";footerButton.className="text-xs text-neutral-500 underline underline-offset-4";footerButton.textContent="Aggiungi Seconda alla schermata Home";footerButton.addEventListener("click",install);
    footer.append(footerButton);document.body.append(footer);show();
  }
})();
