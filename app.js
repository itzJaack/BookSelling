/* global supabase, Richieste */
const demoBooks = [
  { id:"demo-1", isbn:"9788808420649", titolo:"Matematica.verde 2", editore_edizione:"Zanichelli · 3ª edizione", materia:"Matematica", prezzo_richiesto:18, condizioni:"Come Nuovo", disponibile:true },
  { id:"demo-2", isbn:"9788839535985", titolo:"La vita davanti a noi", editore_edizione:"Paravia · Vol. 1", materia:"Italiano", prezzo_richiesto:14.5, condizioni:"Buono", disponibile:true },
  { id:"demo-3", isbn:"9788805078515", titolo:"Fisica: lezioni e problemi", editore_edizione:"SEI · Edizione blu", materia:"Fisica", prezzo_richiesto:21, condizioni:"Segnato", disponibile:true },
  { id:"demo-4", isbn:"9788828620395", titolo:"Itinerario nell’arte", editore_edizione:"Cricco Di Teodoro · Vol. 3", materia:"Arte", prezzo_richiesto:24, condizioni:"Come Nuovo", disponibile:false },
  { id:"demo-5", isbn:"9788808220249", titolo:"Performer Heritage", editore_edizione:"Zanichelli · Vol. 2", materia:"Inglese", prezzo_richiesto:16, condizioni:"Buono", disponibile:true },
  { id:"demo-6", isbn:"9788842116607", titolo:"Storia e storiografia", editore_edizione:"Laterza · Vol. 2", materia:"Storia", prezzo_richiesto:19.5, condizioni:"Evidenziato", disponibile:true }
];

const config = window.SUPABASE_CONFIG || {};
const configured = config.url && config.anonKey && !config.url.includes("IL-TUO") && !config.anonKey.includes("LA-TUA");
const db = configured ? supabase.createClient(config.url, config.anonKey) : null;
let books = demoBooks, searchTerm = "", condition = "";
let pendingRequest = null, submittingOffer = false;

const $ = selector => document.querySelector(selector);
const grid = $("#books-grid"), emptyState = $("#empty-state"), resultCount = $("#result-count");
const banner = $("#status-banner"), modal = $("#offer-modal"), form = $("#offer-form");

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]); }
function normalized(value) { return String(value||"").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function renderBooks() {
  const needle = normalized(searchTerm);
  const filtered = books.filter(book => (!needle || normalized(`${book.isbn} ${book.titolo} ${book.materia} ${book.editore_edizione}`).includes(needle)) && (!condition || book.condizioni === condition));
  resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "risultato" : "risultati"}`;
  emptyState.classList.toggle("hidden", filtered.length > 0); emptyState.classList.toggle("grid", filtered.length === 0); grid.classList.toggle("hidden", filtered.length === 0);
  grid.innerHTML = filtered.map(book => `
    <article class="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md hover:shadow-neutral-200/50">
      <div class="flex items-start justify-between gap-4">
        <span class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-muted">${escapeHtml(book.materia)}</span>
        <span class="inline-flex items-center gap-1.5 text-xs ${book.disponibile ? "text-emerald-700" : "text-red-600"}"><i class="h-1.5 w-1.5 rounded-full ${book.disponibile ? "bg-emerald-500" : "bg-red-500"}"></i>${book.disponibile ? "Disponibile" : "Venduto"}</span>
      </div>
      <h3 class="mt-4 text-base font-semibold leading-snug">${escapeHtml(book.titolo)}</h3>
      <p class="mt-2 text-sm text-muted">${escapeHtml(book.editore_edizione)}</p>
      <p class="mt-3 font-mono text-xs text-gray-400">ISBN ${escapeHtml(book.isbn)}</p>
      <div class="mt-4"><span class="rounded-md border px-2 py-1 text-[11px] font-medium ${book.condizioni === "Come Nuovo" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : book.condizioni === "Buono" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"}">${escapeHtml(book.condizioni)}</span></div>
      <div class="mt-auto flex items-end justify-between gap-4 pt-6">
        <strong class="text-lg">€ ${Number(book.prezzo_richiesto).toFixed(2).replace(".",",")}</strong>
        <button class="offer-button rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${book.disponibile ? "border-ink bg-ink text-white hover:border-accent hover:bg-accent" : "cursor-not-allowed border-neutral-200 text-neutral-400"}" data-book-id="${escapeHtml(book.id)}" ${book.disponibile ? "" : "disabled"}>${book.disponibile ? "Fai un’offerta" : "Venduto"}</button>
      </div>
    </article>`).join("");
  document.querySelectorAll(".offer-button:not(:disabled)").forEach(button => button.addEventListener("click", () => openOffer(button.dataset.bookId)));
}

async function loadBooks() {
  if (!db) { banner.textContent="Modalità demo: configura Supabase in supabase-config.js per caricare i dati reali."; banner.classList.remove("hidden"); renderBooks(); return; }
  const { data, error } = await db.from("Libri").select("*").order("data_inserimento",{ascending:false});
  if (error) { banner.textContent="Catalogo non disponibile. Controlla configurazione e policy RLS."; banner.classList.remove("hidden"); renderBooks(); return; }
  books=data||[]; banner.classList.add("hidden"); renderBooks();
}

function openOffer(id) {
  const book=books.find(item=>String(item.id)===String(id)); if(!book||!book.disponibile)return;
  if(submittingOffer)return;
  pendingRequest=null;form.classList.remove("hidden");$("#offer-receipt").classList.add("hidden");$("#offer-heading").textContent="Fai un’offerta";
  form.reset(); $("#offer-book-id").value=book.id; $("#offer-price").value=book.prezzo_richiesto;
  $("#selected-book").innerHTML=`<p class="font-semibold">${escapeHtml(book.titolo)}</p><p class="mt-1 text-sm text-muted">${escapeHtml(book.materia)} · € ${Number(book.prezzo_richiesto).toFixed(2).replace(".",",")}</p>`;
  $("#form-error").classList.add("hidden"); modal.showModal(); document.body.classList.add("modal-open");
}
function closeModal(){if(submittingOffer)return;modal.close();document.body.classList.remove("modal-open");}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),4500);}

$("#hero-search").addEventListener("submit",event=>{event.preventDefault();searchTerm=$("#search-input").value;renderBooks();$("#catalogo").scrollIntoView({behavior:"smooth"});});
$("#search-input").addEventListener("input",event=>{searchTerm=event.target.value;renderBooks();});
$("#condition-filter").addEventListener("change",event=>{condition=event.target.value;renderBooks();});
$("#close-modal").addEventListener("click",closeModal); modal.addEventListener("click",event=>{if(event.target===modal)closeModal();});
modal.addEventListener("cancel",event=>{if(submittingOffer)event.preventDefault();});
modal.addEventListener("close",()=>document.body.classList.remove("modal-open"));
$("#receipt-copy").addEventListener("click",()=>Richieste.copy($("#receipt-link").value,$("#receipt-feedback")));

form.addEventListener("submit",async event=>{
  event.preventDefault();if(submittingOffer)return; const button=$("#submit-offer"), errorBox=$("#form-error"), values=new FormData(form);
  submittingOffer=true;for(const input of form.elements)input.disabled=true;button.textContent="Invio…";errorBox.classList.add("hidden");
  const payload={libro_id:values.get("libro_id"),nome_acquirente:String(values.get("nome_acquirente")).trim(),email_o_telefono:String(values.get("email_o_telefono")).trim(),prezzo_offerto:Number(values.get("prezzo_offerto")),luogo_proposto:String(values.get("luogo_proposto")).trim(),messaggio:String(values.get("messaggio")).trim(),stato:"In attesa"};
  try {
    if(!db)throw new Error("Configura Supabase prima di inviare offerte.");
    const fingerprint=JSON.stringify(payload);
    if(!pendingRequest||pendingRequest.fingerprint!==fingerprint)pendingRequest={fingerprint,id:crypto.randomUUID(),chiave:Richieste.secret()};
    const {data,error}=await db.rpc("crea_richiesta",{
      p_id:pendingRequest.id,p_chiave:pendingRequest.chiave,p_libro_id:payload.libro_id,
      p_nome:payload.nome_acquirente,p_contatto:payload.email_o_telefono,p_prezzo:payload.prezzo_offerto,
      p_luogo:payload.luogo_proposto,p_messaggio:payload.messaggio
    });
    if(error)throw error;
    const receipt={codice:data.codice_richiesta,chiave:pendingRequest.chiave,titolo:books.find(book=>String(book.id)===String(payload.libro_id))?.titolo||"Richiesta"};
    $("#receipt-code").textContent=receipt.codice;
    $("#receipt-link").value=Richieste.link(receipt);$("#receipt-open").href=Richieste.link(receipt);
    $("#receipt-feedback").textContent=Richieste.save(receipt)?"Salvata in ‘Le mie richieste’ su questo browser. Copia il link per aprirla su un altro dispositivo.":"Salvataggio sul dispositivo non disponibile: copia e conserva il link prima di chiudere.";
    form.classList.add("hidden");$("#offer-receipt").classList.remove("hidden");$("#offer-heading").textContent="Richiesta inviata";
    $("#receipt-open").focus();
  }
  catch(error){errorBox.textContent=Richieste.errorMessage(error);errorBox.classList.remove("hidden");}
  finally{submittingOffer=false;for(const input of form.elements)input.disabled=false;button.textContent="Invia proposta";}
});

loadBooks();
if(db)db.channel("catalogo-pubblico").on("postgres_changes",{event:"*",schema:"public",table:"Libri"},loadBooks).subscribe();
