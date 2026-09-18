/* global supabase, Richieste, Conversazione, Condizioni, SecondaPush */
const config = window.SUPABASE_CONFIG || {};
const configured = config.url && config.anonKey && !config.url.includes("IL-TUO") && !config.anonKey.includes("LA-TUA");
const db = configured ? supabase.createClient(config.url, config.anonKey) : null;
const $ = selector => document.querySelector(selector);
let books = [], offers = [], realtimeChannel = null;
let adminChat = null, activeOfferId = null, sessionVersion = 0;
let editingBookId = null, savingBook = false;
let adminPush = null;
Condizioni.populate($("#book-form").elements.namedItem("condizioni"));

function resetBookForm(){
  editingBookId=null;
  $("#book-form").reset();
  $("#book-form-title").textContent="Aggiungi un libro";
  $("#book-edit-notice").classList.add("hidden");
  $("#cancel-book-edit").classList.add("hidden");
  $("#book-error").classList.add("hidden");
  $("#add-book-button").textContent="Aggiungi libro";
}

function editBook(id){
  if(savingBook)return;
  const book=books.find(item=>item.id===id);if(!book)return;
  const form=$("#book-form");editingBookId=id;
  for(const field of ["isbn","titolo","editore_edizione","materia","prezzo_richiesto","condizioni"])form.elements.namedItem(field).value=book[field];
  $("#book-form-title").textContent="Modifica annuncio";
  $("#book-edit-notice").classList.remove("hidden");
  $("#cancel-book-edit").classList.remove("hidden");
  $("#book-error").classList.add("hidden");
  $("#add-book-button").textContent="Salva modifiche";
  form.scrollIntoView({behavior:"smooth",block:"center"});
  form.elements.namedItem("titolo").focus({preventScroll:true});
}

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
function money(value){return `€ ${Number(value).toFixed(2).replace(".",",")}`;}
function formatDate(value){return new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}
function toast(message){const el=$("#admin-toast");el.textContent=message;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),3500);}
function showError(selector,message){const el=$(selector);el.textContent=message;el.classList.remove("hidden");}

async function handleSession(session){
  const email=session?.user?.email?.toLowerCase();
  const owner=(config.ownerEmail||"").toLowerCase();
  if(!session){sessionVersion++;adminPush?.close();adminPush=null;savingBook=false;resetBookForm();for(const input of $("#book-form").elements)input.disabled=false;closeAdminChat();books=[];offers=[];$("#inventory-list").replaceChildren();$("#offers-list").replaceChildren();if(realtimeChannel){db.removeChannel(realtimeChannel);realtimeChannel=null;}$("#login-view").classList.remove("hidden");$("#admin-view").classList.add("hidden");return;}
  if(!owner || owner.includes("LA-TUA") || email!==owner){await db.auth.signOut();showError("#login-error","Questo account non è autorizzato come proprietario.");return;}
  $("#login-view").classList.add("hidden");$("#admin-view").classList.remove("hidden");$("#admin-email").textContent=email;
  if(!adminPush)adminPush=SecondaPush.mount($("#admin-push"),db,{recipient:"admin"});
  const version=sessionVersion;
  await loadAll(); if(version===sessionVersion)subscribeRealtime();
}

async function loadAll(){
  const version=sessionVersion;
  const [booksResult,offersResult]=await Promise.all([
    db.from("Libri").select("*").order("data_inserimento",{ascending:false}),
    db.from("Offerte_Scambi").select("*,codice_richiesta,libro_titolo").order("data_inserimento",{ascending:false})
  ]);
  if(booksResult.error) return toast(`Errore inventario: ${booksResult.error.message}`);
  if(version!==sessionVersion)return;
  if(offersResult.error) return toast(`Errore offerte: ${Richieste.errorMessage(offersResult.error)}`);
  books=booksResult.data||[];offers=offersResult.data||[];renderInventory();renderOffers();renderStats();
}

function renderStats(){
  $("#stat-books").textContent=books.length;
  $("#stat-available").textContent=books.filter(book=>book.disponibile).length;
  $("#stat-offers").textContent=offers.filter(offer=>offer.stato==="In attesa").length;
}

function renderInventory(){
  $("#inventory-empty").classList.toggle("hidden",books.length>0);
  $("#inventory-list").innerHTML=books.map(book=>`
    <article class="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
      <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h3 class="font-semibold">${escapeHtml(book.titolo)}</h3><span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-muted">${escapeHtml(book.materia)}</span></div><p class="mt-1 text-sm text-muted">${escapeHtml(book.editore_edizione)} · ISBN ${escapeHtml(book.isbn)}</p><p class="mt-2 text-sm"><strong>${money(book.prezzo_richiesto)}</strong><span class="mx-2 text-gray-300">|</span>${escapeHtml(book.condizioni)}</p></div>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex cursor-pointer items-center gap-2 text-xs font-medium"><span>${book.disponibile?"Disponibile":"Venduto"}</span><input class="availability-toggle peer sr-only" type="checkbox" data-id="${book.id}" ${book.disponibile?"checked":""}><span class="relative h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-emerald-500 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5"></span></label>
        <button type="button" class="edit-book rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-soft" data-id="${book.id}" aria-label="Modifica ${escapeHtml(book.titolo)}">Modifica</button>
        <button class="delete-book rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" data-id="${book.id}" data-title="${escapeHtml(book.titolo)}">Elimina</button>
      </div>
    </article>`).join("");
  document.querySelectorAll(".availability-toggle").forEach(input=>input.addEventListener("change",()=>setAvailability(input.dataset.id,input.checked)));
  document.querySelectorAll(".edit-book").forEach(button=>button.addEventListener("click",()=>editBook(button.dataset.id)));
  document.querySelectorAll(".delete-book").forEach(button=>button.addEventListener("click",()=>deleteBook(button.dataset.id,button.dataset.title)));
}

function renderOffers(){
  const needle=$("#offer-search").value.trim().toLocaleLowerCase("it");
  const filtered=offers.filter(offer=>`${offer.codice_richiesta} ${offer.libro_titolo} ${offer.nome_acquirente}`.toLocaleLowerCase("it").includes(needle));
  $("#offers-empty").classList.toggle("hidden",filtered.length>0);
  $("#offers-empty").textContent=offers.length?"Nessuna richiesta corrisponde alla ricerca.":"Non ci sono ancora offerte.";
  const bookMap=new Map(books.map(book=>[book.id,book]));
  $("#offers-list").innerHTML=filtered.map(offer=>{const book=bookMap.get(offer.libro_id);const pending=offer.stato==="In attesa";return `
    <article class="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
      <div><p class="mb-2 font-mono text-xs text-muted">${escapeHtml(offer.codice_richiesta)}</p><div class="flex flex-wrap items-center gap-2"><h3 class="font-semibold">${escapeHtml(book?.titolo||offer.libro_titolo||"Libro eliminato")}</h3><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${offer.stato==="Accettata"?"bg-emerald-50 text-emerald-700":offer.stato==="Rifiutata"?"bg-red-50 text-red-600":"bg-amber-50 text-amber-700"}">${escapeHtml(offer.stato)}</span></div><p class="mt-2 text-sm text-muted">${escapeHtml(offer.nome_acquirente)} · <a class="text-accent hover:underline" href="${String(offer.email_o_telefono).includes("@")?`mailto:${escapeHtml(offer.email_o_telefono)}`:`tel:${escapeHtml(offer.email_o_telefono)}`}">${escapeHtml(offer.email_o_telefono)}</a></p><p class="mt-1 text-xs text-gray-400">${formatDate(offer.data_inserimento)}</p></div>
      <div class="text-sm"><p><span class="text-muted">Offerta:</span> <strong>${money(offer.prezzo_offerto)}</strong></p><p class="mt-1"><span class="text-muted">Scambio:</span> ${escapeHtml(offer.luogo_proposto)}</p>${offer.messaggio?`<p class="mt-2 text-xs italic text-muted">“${escapeHtml(offer.messaggio)}”</p>`:""}</div>
      <div class="flex flex-wrap gap-2">${pending?`<button class="offer-action rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700" data-id="${offer.id}" data-status="Accettata">Accetta</button><button class="offer-action rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-soft" data-id="${offer.id}" data-status="Rifiutata">Rifiuta</button>`:""}<button class="open-conversation rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-soft" data-id="${offer.id}">Messaggi</button></div>
    </article>`}).join("");
  document.querySelectorAll(".offer-action").forEach(button=>button.addEventListener("click",()=>manageOffer(button.dataset.id,button.dataset.status)));
  document.querySelectorAll(".open-conversation").forEach(button=>button.addEventListener("click",()=>openAdminChat(button.dataset.id)));
}

async function setAvailability(id,available){const {error}=await db.from("Libri").update({disponibile:available}).eq("id",id);if(error){toast(error.message);await loadAll();}else toast(available?"Libro segnato disponibile.":"Libro segnato venduto.");}
async function deleteBook(id,title){if(!confirm(`Eliminare “${title}” dal catalogo? Richieste e conversazioni saranno conservate.`))return;const {error}=await db.from("Libri").delete().eq("id",id);if(error)toast(error.message);else{toast("Libro eliminato. Conversazioni conservate.");await loadAll();}}
async function manageOffer(id,status){const {error}=await db.rpc("gestisci_offerta",{p_offerta_id:id,p_stato:status});if(error)toast(error.message);else{toast(status==="Accettata"?"Offerta accettata e libro segnato venduto.":"Offerta rifiutata.");await loadAll();}}

function closeAdminChat(){adminChat?.close();adminChat=null;activeOfferId=null;$("#admin-conversation").close();$("#admin-private-link").value="";document.body.style.overflow="";}
function openAdminChat(id){
  const offer=offers.find(item=>item.id===id);if(!offer)return;
  adminChat?.close();activeOfferId=id;
  $("#admin-chat-code").textContent=offer.codice_richiesta;
  $("#admin-chat-title").textContent=offer.libro_titolo;
  $("#admin-chat-person").textContent=`${offer.nome_acquirente} · ${offer.email_o_telefono} · ${offer.stato}`;
  $("#admin-link-result").classList.add("hidden");$("#admin-private-link").value="";$("#admin-link-feedback").textContent="";
  $("#admin-conversation").showModal();document.body.style.overflow="hidden";
  adminChat=new Conversazione($("#admin-chat"),{
    viewer:"Venditore",
    load:async({after,before})=>{
      let query=db.from("Messaggi_Richieste").select("id,autore,testo,data_inserimento").eq("offerta_id",id);
      if(before!==null)query=query.lt("id",before);else if(after)query=query.gt("id",after);
      const {data,error}=await query.order("id",{ascending:before===null&&after>0}).limit(50);
      if(error)throw error;
      return {messaggi:data,precedenti:data.length===50,successivi:before===null&&after>0&&data.length===50,richiesta:offers.find(item=>item.id===id)};
    },
    send:async(text,clientId)=>{
      const {error}=await db.from("Messaggi_Richieste").insert({offerta_id:id,client_id:clientId,autore:"Venditore",testo:text});
      if(error&&error.code!=="23505")throw error;
    },
    onDetails:details=>{if(details)$("#admin-chat-person").textContent=`${details.nome_acquirente} · ${details.email_o_telefono} · ${details.stato}`;}
  });
}
$("#offer-search").addEventListener("input",renderOffers);
$("#close-admin-chat").addEventListener("click",closeAdminChat);
$("#admin-conversation").addEventListener("cancel",event=>{event.preventDefault();closeAdminChat();});
$("#copy-admin-link").addEventListener("click",()=>Richieste.copy($("#admin-private-link").value,$("#admin-link-feedback")));
$("#regenerate-link").addEventListener("click",async()=>{
  const id=activeOfferId;if(!id||!confirm("Generare un nuovo accesso? Il link privato precedente non funzionerà più."))return;
  const button=$("#regenerate-link");button.disabled=true;
  try{
    const chiave=Richieste.secret();
    const {data,error}=await db.rpc("rigenera_accesso_richiesta",{p_offerta_id:id,p_chiave:chiave});
    if(error)throw error;
    if(activeOfferId!==id)return;
    $("#admin-private-link").value=Richieste.link({codice:data,chiave});$("#admin-link-result").classList.remove("hidden");
    $("#admin-link-feedback").textContent="Nuovo link pronto. Invialo privatamente all’acquirente dopo aver verificato il suo contatto.";
  }catch(error){if(activeOfferId===id)$("#admin-link-feedback").textContent=Richieste.errorMessage(error);}
  finally{button.disabled=false;}
});

$("#login-form").addEventListener("submit",async event=>{
  event.preventDefault();const button=$("#login-button"),errorBox=$("#login-error");errorBox.classList.add("hidden");
  if(!db)return showError("#login-error","Configura prima Supabase in supabase-config.js.");
  const values=new FormData(event.currentTarget);button.disabled=true;button.textContent="Accesso…";
  const {error}=await db.auth.signInWithPassword({email:$("#login-email").value.trim(),password:String(values.get("password"))});
  if(error)showError("#login-error","Email o password non corrette.");button.disabled=false;button.textContent="Accedi";
});
$("#logout-button").addEventListener("click",async()=>{
  const button=$("#logout-button");button.disabled=true;
  try{await SecondaPush.disable(db,{recipient:"admin"});closeAdminChat();if(realtimeChannel){await db.removeChannel(realtimeChannel);realtimeChannel=null;}await db.auth.signOut();}
  catch{toast("Non riesco a disattivare le notifiche su questo dispositivo. Controlla la connessione e riprova a uscire.");}
  finally{button.disabled=false;}
});
$("#cancel-book-edit").addEventListener("click",()=>{if(!savingBook)resetBookForm();});
$("#book-form").addEventListener("submit",async event=>{
  event.preventDefault();if(savingBook)return;
  const bookForm=event.currentTarget,button=$("#add-book-button"),values=new FormData(bookForm),id=editingBookId,version=sessionVersion;
  savingBook=true;for(const input of bookForm.elements)input.disabled=true;
  button.textContent="Salvataggio…";$("#book-error").classList.add("hidden");
  const payload={isbn:String(values.get("isbn")).trim(),titolo:String(values.get("titolo")).trim(),editore_edizione:String(values.get("editore_edizione")).trim(),materia:String(values.get("materia")).trim(),prezzo_richiesto:Number(values.get("prezzo_richiesto")),condizioni:values.get("condizioni")};
  try{
    if(!db)throw new Error("Configura Supabase prima di salvare.");
    if(payload.isbn.length<10||payload.isbn.length>17||payload.titolo.length<2||payload.titolo.length>180||!payload.editore_edizione||!payload.materia||!Condizioni.values.includes(payload.condizioni)||!Number.isFinite(payload.prezzo_richiesto)||payload.prezzo_richiesto<0||payload.prezzo_richiesto>999999.99)throw new Error("Controlla i campi: ISBN di 10–17 caratteri, titolo di almeno 2 caratteri e prezzo valido.");
    // In modifica non sovrascrivere disponibilità, ID o data di inserimento.
    const query=id?db.from("Libri").update(payload).eq("id",id):db.from("Libri").insert({...payload,disponibile:true});
    const {error}=await query.select("id").single();
    if(error)throw error;
    if(version!==sessionVersion)return;
    resetBookForm();toast(id?"Annuncio aggiornato.":"Libro aggiunto.");await loadAll();
  }catch(error){
    if(version===sessionVersion)showError("#book-error",error.code==="23505"?"Esiste già un libro con questo ISBN.":error.code==="PGRST116"?"Libro non trovato o modifica non autorizzata. Ricarica l’inventario.":error.code==="23514"?"Dati non validi. Per le nuove condizioni verifica che la migrazione SQL sia stata applicata.":error.message||"Salvataggio non riuscito. Riprova.");
  }finally{
    if(version===sessionVersion){savingBook=false;for(const input of bookForm.elements)input.disabled=false;button.textContent=editingBookId?"Salva modifiche":"Aggiungi libro";}
  }
});

function subscribeRealtime(){if(realtimeChannel)return;realtimeChannel=db.channel("admin-live").on("postgres_changes",{event:"*",schema:"public",table:"Libri"},loadAll).on("postgres_changes",{event:"*",schema:"public",table:"Offerte_Scambi"},loadAll).on("postgres_changes",{event:"INSERT",schema:"public",table:"Messaggi_Richieste"},payload=>{if(activeOfferId===payload.new.offerta_id)adminChat?.refresh();else if(payload.new.autore==="Acquirente"){const offer=offers.find(item=>item.id===payload.new.offerta_id);toast(`Nuovo messaggio · ${offer?.codice_richiesta||"richiesta"}`);}}).subscribe();}

const notificationCode=new URLSearchParams(location.search).get("richiesta");
if(/^SEC-[A-F0-9]{12}$/.test(notificationCode||""))$("#offer-search").value=notificationCode;
if(!configured)showError("#login-error","Inserisci URL, Anon Key ed email proprietario in supabase-config.js.");
else {$("#login-email").value=config.ownerEmail&&!config.ownerEmail.includes("LA-TUA")?config.ownerEmail:"";db.auth.onAuthStateChange((_event,session)=>setTimeout(()=>handleSession(session),0));db.auth.getSession().then(({data})=>handleSession(data.session));}
