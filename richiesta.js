/* global supabase, Richieste, Conversazione, SecondaPush */
(() => {
  const config = window.SUPABASE_CONFIG || {};
  const configured = config.url && config.anonKey && !config.url.includes("IL-TUO") && !config.anonKey.includes("LA-TUA");
  const db = configured ? supabase.createClient(config.url, config.anonKey) : null;
  const $ = selector => document.querySelector(selector);
  let chat = null;
  let current = null;
  let buyerPush = null;

  function error(message) { $("#page-error").textContent = message; $("#page-error").classList.remove("hidden"); }
  function showSaved() {
    buyerPush?.close();buyerPush=null;
    chat?.close(); chat = null; current = null;
    history.replaceState(null, "", location.pathname);
    $("#private-link").value = "";
    $("#request-link").value = "";
    $("#conversation-view").classList.add("hidden");
    $("#show-saved").classList.add("hidden");
    $("#access-view").classList.remove("hidden");
    $("#page-error").classList.add("hidden");
    renderSaved();
  }
  function renderSaved() {
    const items = Richieste.saved();
    $("#saved-requests").innerHTML = items.length ? items.map(item => `<article class="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4"><a class="min-w-0 hover:text-blue-600" href="${Richieste.escape(Richieste.link(item))}"><span class="block font-mono text-sm">${Richieste.escape(item.codice)}</span><span class="mt-1 block truncate text-xs text-neutral-500">${Richieste.escape(item.titolo || "Apri conversazione")}</span></a><button type="button" class="forget-request shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-500" data-code="${item.codice}" aria-label="Rimuovi ${item.codice} da questo dispositivo">Rimuovi</button></article>`).join("") : '<p class="rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">Nessuna richiesta salvata su questo dispositivo.</p>';
    document.querySelectorAll(".forget-request").forEach(button => button.addEventListener("click", async () => {
      const item=Richieste.saved().find(item=>item.codice===button.dataset.code);if(!item)return;
      button.disabled=true;
      try{await SecondaPush.disable(db,{recipient:"buyer",code:item.codice,key:item.chiave});if (Richieste.forget(item.codice)) renderSaved();else error("Il browser non consente di modificare i dati salvati.");}
      catch{error("Non riesco a disattivare le notifiche della richiesta. Controlla la connessione; se il link è stato revocato, le notifiche sono già disattivate e puoi cancellare i dati dalle impostazioni del browser.");button.disabled=false;}
    }));
  }
  function open(item) {
    if (!db) { error("Il servizio richieste non è ancora configurato."); return; }
    chat?.close();
    buyerPush?.close();buyerPush=null;
    current = item;
    $("#page-error").classList.add("hidden");
    $("#private-link").value = "";
    $("#access-view").classList.add("hidden");
    $("#conversation-view").classList.remove("hidden");
    $("#show-saved").classList.remove("hidden");
    $("#request-code").textContent = item.codice;
    $("#request-title").textContent = "Caricamento richiesta…";
    $("#request-status").textContent = "";
    $("#request-details").textContent = "";
    $("#request-note").textContent = "";
    $("#request-link").value = Richieste.link(item);
    // Fragments do not reach the server; remove the key from the address bar too.
    const visibleUrl=new URL(location.href);visibleUrl.hash="";visibleUrl.searchParams.set("richiesta",item.codice);
    history.replaceState(null, "", visibleUrl.pathname + visibleUrl.search);
    chat = new Conversazione($("#buyer-chat"), {
      viewer: "Acquirente",
      load: async ({ after, before }) => {
        const { data, error } = await db.rpc("leggi_richiesta", { p_codice: item.codice, p_chiave: item.chiave, p_dopo: after, p_prima: before });
        if (error) throw error;
        return data;
      },
      send: async (text, id) => {
        const { error } = await db.rpc("invia_messaggio_richiesta", { p_codice: item.codice, p_chiave: item.chiave, p_testo: text, p_client_id: id });
        if (error) throw error;
      },
      onDetails: details => {
        if(current!==item)return;
        if(!buyerPush)buyerPush=SecondaPush.mount($("#buyer-push"),db,{recipient:"buyer",code:item.codice,key:item.chiave});
        $("#request-title").textContent = details.libro_titolo;
        $("#request-status").textContent = details.stato;
        $("#request-details").textContent = `Offerta: € ${Number(details.prezzo_offerto).toFixed(2).replace(".", ",")} · Scambio: ${details.luogo_proposto}`;
        $("#request-note").textContent = details.messaggio ? `Proposta iniziale: ${details.messaggio}` : "";
        if (!Richieste.save({ ...item, titolo: details.libro_titolo })) $("#copy-feedback").textContent = "Salvataggio sul dispositivo non disponibile: copia e conserva il link.";
      }
    });
  }
  $("#access-form").addEventListener("submit", event => {
    event.preventDefault();
    const item = Richieste.parse($("#private-link").value.trim());
    if (!item) return error("Incolla il link privato completo, con codice e chiave della richiesta.");
    open(item);
  });
  $("#show-saved").addEventListener("click", showSaved);
  $("#copy-link").addEventListener("click", () => { if (current) Richieste.copy(Richieste.link(current), $("#copy-feedback")); });
  window.addEventListener("hashchange", () => {
    const item = Richieste.parse(location.href);
    if (item) open(item); else showSaved();
  });
  renderSaved();
  const initial = Richieste.parse(location.href);
  const code=new URLSearchParams(location.search).get("richiesta");
  const fromNotification=Richieste.saved().find(item=>item.codice===code);
  if (initial) open(initial);
  else if(fromNotification)open(fromNotification);
  else if(code)error("Apri questa richiesta incollando il suo link privato. Non è salvata in questo browser.");
  else if (location.hash) error("Il link non è completo. Incolla il link privato originale.");
})();
