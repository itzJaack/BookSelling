import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2,"0")).join("");
function checked(result: any) { if (result.error) throw new Error("Servizio notifiche non disponibile. Riprova."); return result.data; }
function subscription(value: any) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048) throw new Error("Dispositivo non valido.");
  const url = new URL(value.endpoint);
  const host = url.hostname;
  const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" || host.endsWith(".notify.windows.com");
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) throw new Error("Servizio push del browser non supportato.");
  if (!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || "") || !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || "")) throw new Error("Chiavi del dispositivo non valide.");
  return { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth };
}
async function settings() {
  let config = checked(await db.rpc("push_server_config"));
  if (!config.public_key) {
    const keys = webpush.generateVAPIDKeys();
    config = checked(await db.rpc("push_server_config", { p_public: keys.publicKey, p_private: keys.privateKey }));
  }
  return config;
}
async function principal(req: Request, body: any, config: any) {
  if (body.recipient === "admin") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user || data.user.email?.toLowerCase() !== config.admin_email.toLowerCase()) throw new Error("Accedi come amministratore.");
    return { recipient: "admin", principal: data.user.id, offerta_id: null, access_hash: null };
  }
  if (body.recipient !== "buyer" || !/^SEC-[A-F0-9]{12}$/.test(body.code || "") || !/^[a-f0-9]{64}$/.test(body.key || "")) throw new Error("Link privato non valido.");
  const offer = checked(await db.from("Offerte_Scambi").select("id").eq("codice_richiesta",body.code).maybeSingle());
  const access = offer && checked(await db.from("Accessi_Richieste").select("chiave_hash").eq("offerta_id",offer.id).maybeSingle());
  const digest = await hash(body.key);
  if (body.action !== "unsubscribe" && (!access || access.chiave_hash !== "\\x" + digest)) throw new Error("Link privato non valido o revocato.");
  // Un vecchio link può rimuovere solo il proprio vecchio legame, non quello nuovo.
  return { recipient: "buyer", principal: offer?.id || body.code, offerta_id: offer?.id || null, access_hash: digest };
}
async function processJobs(config: any) {
  const jobs = checked(await db.rpc("push_claim"));
  await Promise.all(jobs.map(async (job: any) => {
    const binding = checked(await db.from("push_subscriptions").select("*").eq("id",job.subscription_id).maybeSingle());
    if (!binding) return;
    if (binding.recipient === "admin") {
      const {data,error}=await db.auth.admin.getUserById(binding.principal);
      if(error || data.user?.email?.toLowerCase()!==config.admin_email.toLowerCase()){checked(await db.from("push_subscriptions").delete().eq("id",binding.id));return;}
    }
    if (binding.recipient === "buyer") {
      const access = checked(await db.from("Accessi_Richieste").select("chiave_hash").eq("offerta_id",binding.offerta_id).maybeSingle());
      if (!access || access.chiave_hash !== "\\x" + binding.access_hash) { checked(await db.from("push_subscriptions").delete().eq("id",binding.id)); return; }
    }
    try {
      const sub = subscription({endpoint:binding.endpoint,keys:{p256dh:binding.p256dh,auth:binding.auth}});
      const url = new URL(binding.recipient === "admin" ? "admin.html" : "richiesta.html", config.site_url);
      if (job.code) url.searchParams.set("richiesta",job.code);
      const payload = JSON.stringify({title: job.kind === "offer" ? "Nuova offerta ricevuta" : job.kind === "test" ? "Notifiche attive" : "Nuovo messaggio",body:job.kind === "test" ? "Questo telefono può ricevere le notifiche di Seconda." : "Apri Seconda per visualizzare i dettagli.",url:url.href,tag:job.id,recipient:binding.recipient});
      // Genera intestazioni e corpo cifrato; fetch con redirect vietati evita SSRF.
      const details = webpush.generateRequestDetails({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:3600,urgency:"normal",vapidDetails:{subject:config.site_url,publicKey:config.public_key,privateKey:config.private_key}});
      const response = await fetch(details.endpoint,{method:"POST",headers:details.headers,body:details.body,redirect:"error",signal:AbortSignal.timeout(10000)});
      await response.body?.cancel();
      if (response.status === 404 || response.status === 410) { checked(await db.from("push_subscriptions").delete().eq("endpoint_hash",binding.endpoint_hash)); return; }
      if (!response.ok) throw Object.assign(new Error("Push provider error"),{status:response.status});
      checked(await db.from("push_jobs").update({status:"done",last_error:null}).eq("id",job.id).eq("attempts",job.attempts));
    } catch (error: any) {
      checked(await db.from("push_jobs").update({status:job.attempts>=5?"dead":"pending",last_error:`Invio fallito (${Number(error.status)||0})`,available_at:new Date(Date.now()+Math.min(3600000,60000*2**job.attempts)).toISOString()}).eq("id",job.id).eq("attempts",job.attempts));
    }
  }));
  return {processed:jobs.length};
}

Deno.serve(async req => {
  const headers: Record<string,string> = {"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
  const origin = req.headers.get("origin");
  // Nessuna chiave segreta o contenuto dei messaggi viene restituito al browser.
  try {
    const config = await settings();
    if (origin === new URL(config.site_url).origin) Object.assign(headers,{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, content-type, apikey","Access-Control-Allow-Methods":"GET, POST, OPTIONS"});
    if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
    if (req.method === "GET") return Response.json({publicKey:config.public_key},{headers});
    if (req.method !== "POST") return new Response(null,{status:405,headers});
    const raw = await req.text();if (raw.length>8192) throw new Error("Richiesta troppo grande.");
    const body = JSON.parse(raw);
    if (body.action === "process") {
      if (!req.headers.get("x-push-worker") || await hash(req.headers.get("x-push-worker")!) !== await hash(config.worker_secret)) return Response.json({error:"Non autorizzato"},{status:401,headers});
      return Response.json(await processJobs(config),{headers});
    }
    const owner = await principal(req,body,config);
    const sub = subscription(body.subscription), endpoint_hash = await hash(sub.endpoint);
    let lookup = db.from("push_subscriptions").select("id").eq("endpoint_hash",endpoint_hash).eq("recipient",owner.recipient).eq("principal",owner.principal);
    if(owner.recipient==="buyer")lookup=lookup.eq("access_hash",owner.access_hash!);
    const existing = checked(await lookup.maybeSingle());
    if (body.action === "status") return Response.json({active:!!existing},{headers});
    if (body.action === "unsubscribe") {
      if (existing) checked(await db.from("push_subscriptions").delete().eq("id",existing.id));
      return Response.json({active:false},{headers});
    }
    if (body.action === "subscribe") {
      const {count,error} = await db.from("push_subscriptions").select("id",{count:"exact",head:true}).eq("recipient",owner.recipient).eq("principal",owner.principal);
      if (error) throw new Error("Servizio non disponibile.");
      if (!existing && (count||0)>=10) throw new Error("Hai già attivato dieci dispositivi per questa richiesta.");
      checked(await db.from("push_subscriptions").upsert({...sub,...owner,endpoint_hash,updated_at:new Date().toISOString()},{onConflict:"endpoint_hash,recipient,principal"}));
      return Response.json({active:true},{headers});
    }
    if (body.action === "test" && existing) {
      // Un test al minuto per dispositivo; nessun testo o destinatario arbitrario.
      const minute = Math.floor(Date.now()/60000);
      checked(await db.from("push_jobs").upsert({subscription_id:existing.id,event_key:`test:${minute}`,kind:"test"},{onConflict:"subscription_id,event_key",ignoreDuplicates:true}));
      return Response.json({queued:true},{headers});
    }
    throw new Error("Operazione non valida.");
  } catch(error: any) { return Response.json({error:error.message||"Notifiche non disponibili."},{status:400,headers}); }
});
