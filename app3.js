const DEFAULT={version:1,cards:[],expenses:[],goals:[],workDaysPerWeek:6,oneTimeExpenses:[],payoffAdjustments:{weekly:[],monthly:[]}};
const SUPABASE_URL="https://hvfsgpixzbblpqruapik.supabase.co";
const SUPABASE_KEY="sb_publishable_48cBvLI6JMtH1Haw6Tu0EQ_5dKZL3bv";
const sb=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let user=null,channel=null,saveTimer=null,databaseReady=false;
let localRevision=0, savedRevision=0, cloudWrite=Promise.resolve(), loadingCloud=false;
let isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

function saveLocal(){try{localStorage.setItem("creditCardManagerDatabaseV2",JSON.stringify(data));return true}catch(e){console.warn("Could not save local database:",e);return false}}
function toast(message){const el=document.createElement("div");el.textContent=message;el.style.cssText="position:fixed;right:20px;bottom:20px;background:#111;color:#fff;padding:12px 16px;border-radius:10px;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.25);font:14px system-ui,sans-serif";document.body.appendChild(el);setTimeout(()=>el.remove(),2200)}
function normalize(){data={version:1,cards:Array.isArray(data.cards)?data.cards.map(c=>({...c,startingBalance:Number(c.startingBalance||0),creditLimit:Number(c.creditLimit||0),apr:Number(c.apr||0),minimumPayment:Number(c.minimumPayment||0),dueDay:c.dueDay?Number(c.dueDay):null,closingDay:c.closingDay?Number(c.closingDay):null,transactions:Array.isArray(c.transactions)?c.transactions.map(t=>({...t,amount:Number(t.amount||0)})):[]})):[],expenses:Array.isArray(data.expenses)?data.expenses.map(x=>({...x,amount:Number(x.amount||0),frequency:['daily','weekly','monthly'].includes(x.frequency)?x.frequency:'monthly'})):[],goals:Array.isArray(data.goals)?data.goals.map(x=>({...x,target:Number(x.target||0),current:Number(x.current||0),deadline:x.deadline||''})):[],workDaysPerWeek:Math.max(1,Math.min(7,Number(data.workDaysPerWeek)||6)),oneTimeExpenses:Array.isArray(data.oneTimeExpenses)?data.oneTimeExpenses.map(x=>({...x,amount:Number(x.amount)||0,date:x.date||''})):[],statementMinimums:Object.fromEntries(Object.entries(data.statementMinimums||{}).filter(([key,value])=>/^.+\|\d{4}-\d{2}-\d{2}$/.test(key)&&value&&/^\d{4}-\d{2}-\d{2}$/.test(value.statementDate||'')&&Number.isFinite(Number(value.minimum))&&Number(value.minimum)>=0).map(([key,value])=>[key,{statementDate:value.statementDate,minimum:Math.round(Number(value.minimum)*100)/100}])),minimumAmountOverrides:Object.fromEntries(Object.entries(data.minimumAmountOverrides||{}).filter(([key,value])=>/\|\d{4}-\d{2}-\d{2}$/.test(key)&&Number.isFinite(Number(value))&&Number(value)>=0).map(([key,value])=>[key,Math.round(Number(value)*100)/100])),minimumCycleOverrides:Object.fromEntries(Object.entries(data.minimumCycleOverrides||{}).filter(([key,value])=>/\|\d{4}-\d{2}-\d{2}$/.test(key)&&value===true)),payoffCardAdjustments:Object.fromEntries(Object.entries(data.payoffCardAdjustments||{}).filter(([key,values])=>/^(weekly|monthly):[1-9]\d*$/.test(key)&&values&&typeof values==='object'&&!Array.isArray(values)).map(([key,values])=>[key,Object.fromEntries(Object.entries(values).filter(([id,amount])=>id&&Number.isFinite(Number(amount))&&Number(amount)>=0).map(([id,amount])=>[id,Math.round(Number(amount)*100)/100]))])),payoffAdjustments:Object.fromEntries(['weekly','monthly'].map(f=>[f,(Array.isArray(data.payoffAdjustments?.[f])?data.payoffAdjustments[f]:[]).filter(a=>Number.isInteger(Number(a.period))&&Number(a.period)>0&&Number.isFinite(Number(a.amount))&&Number(a.amount)>0).map(a=>({period:Number(a.period),amount:Number(a.amount),scope:a.scope==='once'?'once':'future'}))]))}}
function changed(){render();autoSaveDatabase()}
function autoSaveDatabase(){localRevision++;saveLocal();clearTimeout(saveTimer);if(user)saveTimer=setTimeout(()=>{saveCloud()},400);else setStatus("Saved on this device only. Sign in to sync.",false)}
async function saveCloud(){
  clearTimeout(saveTimer);
  if(!user||!sb){setStatus("Not signed in — changes saved on this device only.",false);return false}
  const accountId=user.id;
  const revision=localRevision;
  const snapshot=JSON.parse(JSON.stringify(data));
  const operation=async()=>{
    if(!user||user.id!==accountId)return false;
    setStatus("Cloud sync: saving…",false);
    try{
      const {data:confirmed,error}=await sb.from("credit_card_data")
        .upsert({user_id:accountId,data:snapshot,updated_at:new Date().toISOString()},{onConflict:"user_id"})
        .select("user_id").single();
      if(error)throw error;
      if(!confirmed)throw new Error("Database did not confirm the save.");
      savedRevision=Math.max(savedRevision,revision);
      if(localRevision===revision)setStatus("Cloud sync: saved successfully.",true);
      else setStatus("Cloud sync: newer changes still pending.",false);
      return true;
    }catch(error){
      console.error("Cloud save failed:",error);
      setStatus("Cloud sync FAILED: "+(error.message||String(error)),false);
      return false;
    }
  };
  cloudWrite=cloudWrite.then(operation,operation);
  const success=await cloudWrite;
  if(success&&localRevision>revision&&user?.id===accountId){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{saveCloud()},400);
  }
  return success;
}
async function loadCloud(){
  if(!user)return;
  const accountId=user.id;
  loadingCloud=true;
  setStatus("Cloud sync: loading…",false);
  try{
    const {data:r,error}=await sb.from("credit_card_data").select("data").eq("user_id",accountId).maybeSingle();
    if(error)throw error;
    if(!user||user.id!==accountId)return;
    if(localRevision>savedRevision){
      setStatus("Unsaved local changes detected. Use Sync Now to upload them.",false);
    }else if(r?.data){
      data=r.data;normalize();saveLocal();databaseReady=true;render();
      if(typeof renderPlanner==="function")renderPlanner();
      setStatus("Cloud sync: loaded.",true);
    }else{
      setStatus("No cloud database found. Use Sync Now to upload local data.",false);
    }
    subscribe();
  }catch(error){
    console.error("Cloud load failed:",error);
    setStatus("Cloud sync FAILED: "+(error.message||String(error)),false);
  }finally{loadingCloud=false}
}
function subscribe(){
  if(channel)sb.removeChannel(channel);
  channel=sb.channel("credit-card-"+user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"credit_card_data",filter:"user_id=eq."+user.id},p=>{
      if(!p.new?.data||loadingCloud||localRevision>savedRevision)return;
      data=p.new.data;normalize();saveLocal();render();
      if(typeof renderPlanner==="function")renderPlanner();
      setStatus("Cloud sync: updated.",true);
    }).subscribe();
}
async function signIn(){const {error}=await sb.auth.signInWithPassword({email:$("#authEmail").value.trim(),password:$("#authPassword").value});$("#authMessage").textContent=error?.message||"Signed in."}
async function signUp(){const {error}=await sb.auth.signUp({email:$("#authEmail").value.trim(),password:$("#authPassword").value});$("#authMessage").textContent=error?.message||"Account created. Check your email if confirmation is required."}
function openFile(){const input=$("#jsonFileInput");input.click()}
async function importJson(file){try{const imported=JSON.parse(await file.text());if(!imported||typeof imported!=="object"||!Array.isArray(imported.cards))throw new Error("JSON must contain a cards array");data=imported;normalize();databaseReady=true;changed();toast(user?"Imported and syncing to cloud":"Imported locally")}catch(e){alert("Could not import JSON: "+e.message)}}
async function saveFile(){saveLocal();if(user){await saveCloud()}else{download();setStatus("Saved locally and exported as JSON. Sign in to sync.",true)}}
function download(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="credit-card-manager.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function loadLocalOrStarter(){try{const saved=localStorage.getItem("creditCardManagerDatabaseV2");if(saved){data=JSON.parse(saved);normalize();databaseReady=true;render();if(typeof renderPlanner==="function")renderPlanner();setStatus("Local database loaded. Sign in to sync across devices.",true);return}}catch(e){console.warn(e)}fetch("data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(json=>{data=json;normalize();databaseReady=true;render();if(typeof renderPlanner==="function")renderPlanner();setStatus("Database ready. Sign in to sync across devices.",true)}).catch(e=>{data=structuredClone(DEFAULT);render();if(typeof renderPlanner==="function")renderPlanner();setStatus("Ready. Sign in to create your cloud database.",true)})}

// Remember interface preferences on this device, separate from financial cloud data.
const UI_PREFS_KEY="creditCardManagerUiPreferencesV1";
function readUiPrefs(){try{const p=JSON.parse(localStorage.getItem(UI_PREFS_KEY)||"{}");return p&&typeof p==="object"?p:{}}catch(e){return {}}}
function saveUiPrefs(){try{localStorage.setItem(UI_PREFS_KEY,JSON.stringify({
  tab:document.querySelector(".tab.active")?.dataset.tab||"dashboard",
  frequency:$("#payoffFrequency").value,
  payment:$("#customPayment").value,
  startDate:$("#firstPaymentDate").value
}))}catch(e){console.warn("Could not save UI preferences:",e)}}
function activateSavedTab(name){
  const button=Array.from(document.querySelectorAll(".tab")).find(b=>b.dataset.tab===name);
  const panel=button&&document.getElementById(name);
  if(!button||!panel)return;
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
  button.classList.add("active");panel.classList.add("active");
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{activateSavedTab(b.dataset.tab);saveUiPrefs()});
(function restoreUiPrefs(){
  const p=readUiPrefs();
  if(["weekly","monthly"].includes(p.frequency))$("#payoffFrequency").value=p.frequency;
  if(typeof p.payment==="string"&&p.payment!==""&&Number.isFinite(Number(p.payment))&&Number(p.payment)>=0)$("#customPayment").value=p.payment;
  if(typeof p.startDate==="string"&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.startDate))$("#firstPaymentDate").value=p.startDate;
  if(typeof p.tab==="string")activateSavedTab(p.tab);
  ["change","input"].forEach(event=>["payoffFrequency","customPayment","firstPaymentDate"].forEach(id=>document.getElementById(id)?.addEventListener(event,saveUiPrefs)));
  calculatePayoff();
})();
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
$("#syncNowBtn").onclick=async()=>{await saveCloud()};
$("#addCardBtn").onclick=addCard;$("#addCardDash").onclick=addCard;$("#addTxBtn").onclick=addTx;$("#closeModal").onclick=closeModal;$("#txCardFilter").onchange=renderTransactions;$("#txTypeFilter").onchange=renderTransactions;$("#payoffFrequency").onchange=calculatePayoff;$("#customPayment").oninput=calculatePayoff;$("#calculateBtn").onclick=calculatePayoff;
$("#jsonFileInput").accept=".json,application/json";

if(sb)sb.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;$("#syncNowBtn").style.display=user?"inline-flex":"none";if(user){$("#accountBtn").textContent="Account";$("#accountStatus").textContent="Cloud sync: "+user.email;await loadCloud()}else{$("#accountBtn").textContent="Sign In / Sync";$("#accountStatus").textContent="Cloud sync: not signed in";if(channel){sb.removeChannel(channel);channel=null}setStatus("Cloud sync: not signed in")}});

loadLocalOrStarter();