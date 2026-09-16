/* Shared by the catalogue, buyer area and administrator. No secret keys in source. */
window.Richieste = (() => {
  const storageKey = "seconda-richieste-v1";
  const escape = (value = "") => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const valid = item => item && /^SEC-[A-F0-9]{12}$/.test(item.codice) && /^[a-f0-9]{64}$/.test(item.chiave);
  const secret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
  function link(item) {
    const url = new URL("richiesta.html", window.location.href);
    url.hash = new URLSearchParams({ codice: item.codice, chiave: item.chiave }).toString();
    return url.href;
  }
  function parse(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== new URL("richiesta.html", window.location.href).pathname) return null;
      const params = new URLSearchParams(url.hash.slice(1));
      const item = { codice: (params.get("codice") || "").toUpperCase(), chiave: params.get("chiave") || "" };
      return valid(item) ? item : null;
    } catch { return null; }
  }
  function saved() {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(items) ? items.filter(valid).slice(0, 30) : [];
    } catch { return []; }
  }
  function save(item) {
    if (!valid(item)) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify([item, ...saved().filter(old => old.codice !== item.codice)].slice(0, 30)));
      return true;
    } catch { return false; }
  }
  function forget(code) {
    try { localStorage.setItem(storageKey, JSON.stringify(saved().filter(item => item.codice !== code))); return true; }
    catch { return false; }
  }
  async function copy(value, feedback) {
    try { await navigator.clipboard.writeText(value); feedback.textContent = "Link copiato."; }
    catch { feedback.textContent = "Copia manualmente il link dal campo qui sopra."; }
  }
  function errorMessage(error) {
    if (["PGRST202", "42P01", "42703"].includes(error?.code)) return "Il servizio messaggi non è ancora attivo. Contatta il venditore.";
    return error?.message || "Connessione non disponibile. Riprova tra poco.";
  }
  return { escape, secret, link, parse, saved, save, forget, copy, errorMessage };
})();

window.Conversazione = class {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.messages = new Map();
    this.active = true;
    this.busy = false;
    this.sending = false;
    this.retry = null;
    root.innerHTML = `
      <button data-older class="mb-4 hidden rounded-lg border border-neutral-300 px-3 py-2 text-xs disabled:opacity-50" type="button">Carica messaggi precedenti</button>
      <div data-messages role="log" aria-label="Conversazione" aria-live="polite" aria-relevant="additions" class="max-h-[50vh] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-neutral-50 p-4"><p class="text-sm text-neutral-500">Caricamento messaggi…</p></div>
      <p data-error class="mt-3 hidden text-sm text-red-700" role="alert"></p>
      <form data-form class="mt-4">
        <label class="text-sm font-medium">Messaggio<textarea data-text required maxlength="2000" rows="3" class="mt-2 block w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm outline-none focus:border-blue-600" placeholder="Scrivi per concordare lo scambio o chiedere informazioni…"></textarea></label>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><p data-sync class="text-xs text-neutral-500" role="status">Aggiornamento automatico ogni 10 secondi.</p><button data-submit type="submit" class="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Invia messaggio</button></div>
      </form>`;
    this.get = selector => root.querySelector(selector);
    this.get("[data-form]").addEventListener("submit", event => { event.preventDefault(); this.send(); });
    this.get("[data-older]").addEventListener("click", () => this.refresh(true));
    this.visibility = () => { if (!document.hidden) this.refresh(); };
    document.addEventListener("visibilitychange", this.visibility);
    this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, 10000);
    this.refresh();
  }
  async refresh(older = false) {
    if (!this.active || this.busy) { this.refreshAgain = !older; return; }
    this.busy = true;
    this.get("[data-older]").disabled = true;
    try {
      const ids = [...this.messages.keys()];
      const data = await this.options.load({ after: older ? 0 : Math.max(0, ...ids), before: older ? Math.min(...ids) : null });
      if (!this.active) return;
      this.options.onDetails?.(data.richiesta);
      let changed = false;
      for (const message of data.messaggi) {
        if (!this.messages.has(Number(message.id))) changed = true;
        this.messages.set(Number(message.id), message);
      }
      if (older || ids.length === 0) this.get("[data-older]").classList.toggle("hidden", !data.precedenti);
      if (changed || ids.length === 0) this.render(older);
      this.get("[data-error]").classList.add("hidden");
      this.get("[data-sync]").textContent = "Messaggi aggiornati · controllo ogni 10 secondi";
      if (!older && data.successivi) this.refreshAgain = true;
    } catch (error) {
      if (this.active) {
        this.error(error);
        this.get("[data-sync]").textContent = "Aggiornamento sospeso · nuovo tentativo tra 10 secondi";
      }
    } finally {
      this.busy = false;
      if (this.active) {
        this.get("[data-older]").disabled = false;
        if (this.refreshAgain) { this.refreshAgain = false; this.refresh(); }
      }
    }
  }
  render(older) {
    const list = this.get("[data-messages]");
    const previousHeight = list.scrollHeight;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    const date = value => new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    list.innerHTML = [...this.messages.values()].sort((a, b) => Number(a.id) - Number(b.id)).map(message => {
      const own = message.autore === this.options.viewer;
      return `<article class="max-w-[90%] rounded-xl border p-3 ${own ? "ml-auto border-blue-100 bg-blue-50" : "border-neutral-200 bg-white"}"><p class="text-xs text-neutral-500">${own ? "Tu" : Richieste.escape(message.autore)} · ${date(message.data_inserimento)}</p><p class="mt-1 whitespace-pre-wrap break-words text-sm">${Richieste.escape(message.testo)}</p></article>`;
    }).join("") || '<p class="py-6 text-center text-sm text-neutral-500">Ancora nessun messaggio. La conversazione resta disponibile anche dopo lo scambio.</p>';
    if (older) list.scrollTop += list.scrollHeight - previousHeight;
    else if (nearBottom || this.justSent) list.scrollTop = list.scrollHeight;
    this.justSent = false;
  }
  error(error) {
    this.get("[data-error]").textContent = Richieste.errorMessage(error);
    this.get("[data-error]").classList.remove("hidden");
  }
  async send() {
    if (!this.active || this.sending) return;
    const input = this.get("[data-text]");
    const text = input.value.trim();
    if (!text) return;
    this.sending = true;
    this.get("[data-submit]").disabled = true;
    input.disabled = true;
    try {
      if (!this.retry || this.retry.text !== text) this.retry = { text, id: crypto.randomUUID() };
      await this.options.send(text, this.retry.id);
      if (!this.active) return;
      input.value = "";
      this.retry = null;
      this.justSent = true;
      await this.refresh();
    } catch (error) { if (this.active) this.error(error); }
    finally {
      this.sending = false;
      if (this.active) { this.get("[data-submit]").disabled = false; input.disabled = false; input.focus(); }
    }
  }
  close() {
    this.active = false;
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.visibility);
    this.messages.clear();
    this.root.replaceChildren();
  }
};
