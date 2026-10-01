const DEFAULT={version:1,cards:[],expenses:[],goals:[]};
const SUPABASE_URL="https://hvfsgpixzbblpqruapik.supabase.co";
const SUPABASE_KEY="sb_publishable_48cBvLI6JMtH1Haw6Tu0EQ_5dKZL3bv";
const sb=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let user=null,channel=null,saveTimer=null,databaseReady=false;
let isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

function saveLocal(){try{localStorage.setItem("creditCardManagerDatabaseV2",JSON.stringify(data));return true}catch(e){console.warn("Could not save local database:",e);return false}}
function toast(message){const el=document.createElement("div");el.textContent=message;el.style.cssText="position:fixed;right:20px;bottom:20px;background:#111;color:#fff;padding:12px 16px;border-radius:10px;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.25);font:14px system-ui,sans-serif";document.body.appendChild(el);setTimeout(()=>el.remove(),2200)}
function normalize(){data={version:1,cards:Array.isArray(data.cards)?data.cards.map(c=>({...c,startingBalance:Number(c.startingBalance||0),creditLimit:Number(c.creditLimit||0),apr:Number(c.apr||0),minimumPayment:Number(c.minimumPayment||0),dueDay:c.dueDay?Number(c.dueDay):null,closingDay:c.closingDay?Number(c.closingDay):null,transactions:Array.isArray(c.transactions)?c.transactions.map(t=>({...t,amount:Number(t.amount||0)})):[]})):[],expenses:Array.isArray(data.expenses)?data.expenses.map(x=>({...x,amount:Number(x.amount||0),frequency:['daily','weekly','monthly'].includes(x.frequency)?x.frequency:'monthly'})):[],goals:Array.isArray(data.goals)?data.goals.map(x=>({...x,target:Number(x.target||0),current:Number(x.current||0),deadline:x.deadline||''})):[]}}
function changed(){saveLocal();render();autoSaveDatabase()}
function autoSaveDatabase(){saveLocal();clearTimeout(saveTimer);if(user)saveTimer=setTimeout(saveCloud,400)}
async function saveCloud(){if(!user||!sb)return;const {error}=await sb.from("credit_card_data").upsert({user_id:user.id,data,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error){console.error(error);setStatus("Cloud sync error: "+error.message,false)}}
async function loadCloud(){if(!user)return;setStatus("Cloud sync: loading…");const {data:r,error}=await sb.from("credit_card_data").select("data").eq("user_id",user.id).maybeSingle();if(error){setStatus("Cloud sync: database setup needed — "+error.message,false);return}if(r?.data){data=r.data;normalize();saveLocal();databaseReady=true;render()}else{normalize();await saveCloud();databaseReady=true;render()}setStatus("Cloud sync: "+user.email,true);subscribe()}
function subscribe(){if(channel)sb.removeChannel(channel);channel=sb.channel("credit-card-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"credit_card_data",filter:"user_id=eq."+user.id},p=>{if(p.new?.data){data=p.new.data;normalize();saveLocal();render();setStatus("Cloud sync: updated",true)}}).subscribe()}
async function signIn(){const {error}=await sb.auth.signInWithPassword({email:$("#authEmail").value.trim(),password:$("#authPassword").value});$("#authMessage").textContent=error?.message||"Signed in."}
async function signUp(){const {error}=await sb.auth.signUp({email:$("#authEmail").value.trim(),password:$("#authPassword").value});$("#authMessage").textContent=error?.message||"Account created. Check your email if confirmation is required."}
function openFile(){const input=$("#jsonFileInput");input.click()}
async function importJson(file){try{const imported=JSON.parse(await file.text());if(!imported||typeof imported!=="object"||!Array.isArray(imported.cards))throw new Error("JSON must contain a cards array");data=imported;normalize();databaseReady=true;changed();toast(user?"Imported and syncing to cloud":"Imported locally")}catch(e){alert("Could not import JSON: "+e.message)}}
function saveFile(){saveLocal();if(user){saveCloud();setStatus("Database saved to cloud.",true)}else{download();setStatus("Saved locally and exported as data.json.",true)}}
function download(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="credit-card-manager.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function loadLocalOrStarter(){try{const saved=localStorage.getItem("creditCardManagerDatabaseV2");if(saved){data=JSON.parse(saved);normalize();databaseReady=true;render();setStatus("Local database loaded. Sign in to sync across devices.",true);return}}catch(e){console.warn(e)}fetch("data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(json=>{data=json;normalize();databaseReady=true;render();setStatus("Database ready. Sign in to sync across devices.",true)}).catch(e=>{data=structuredClone(DEFAULT);render();setStatus("Ready. Sign in to create your cloud database.",true)})}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.tab).classList.add("active")});
$("#openBtn").onclick=openFile;
$("#saveBtn").onclick=saveFile;
$("#downloadBtn").onclick=download;
$("#importJsonBtn").onclick=()=>$("#jsonFileInput").click();
$("#jsonFileInput").onchange=async e=>{const file=e.target.files?.[0];if(file)await importJson(file);e.target.value=""};
$("#accountBtn").onclick=()=>{$("#authMessage").textContent=user?user.email:"";$("#signOutBtn").style.display=user?"block":"none";$("#authDialog").showModal()};
$("#closeAuthBtn").onclick=()=>$("#authDialog").close();
$("#authForm").onsubmit=async e=>{e.preventDefault();if(sb)await signIn()};
$("#signUpBtn").onclick=async()=>{if(sb)await signUp()};
$("#signOutBtn").onclick=async()=>{await sb.auth.signOut();$("#authDialog").close()};
$("#syncNowBtn").onclick=async()=>{await saveCloud();setStatus(user?"Cloud sync: saved":"Cloud sync: not signed in",!!user)};
$("#addCardBtn").onclick=addCard;$("#addCardDash").onclick=addCard;$("#addTxBtn").onclick=addTx;$("#closeModal").onclick=closeModal;$("#txCardFilter").onchange=renderTransactions;$("#txTypeFilter").onchange=renderTransactions;$("#payoffFrequency").onchange=calculatePayoff;$("#customPayment").oninput=calculatePayoff;$("#calculateBtn").onclick=calculatePayoff;
$("#jsonFileInput").accept=".json,application/json";

if(sb)sb.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;$("#syncNowBtn").style.display=user?"inline-flex":"none";if(user){$("#accountBtn").textContent="Account";$("#accountStatus").textContent="Cloud sync: "+user.email;await loadCloud()}else{$("#accountBtn").textContent="Sign In / Sync";$("#accountStatus").textContent="Cloud sync: not signed in";if(channel){sb.removeChannel(channel);channel=null}setStatus("Cloud sync: not signed in")}});

loadLocalOrStarter();