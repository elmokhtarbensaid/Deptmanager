let isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let databaseReady=false;
let saveTimer=null;
function isFileDatabaseOpen(){return !!(fileHandle&&fileHandle.createWritable);}
function persistLocal(){try{localStorage.setItem('creditCardManagerData',JSON.stringify(data));return true}catch(e){console.warn('Could not save local database:',e);return false}}
async function persistDatabase(){persistLocal();if(isFileDatabaseOpen()){try{const writable=await fileHandle.createWritable();await writable.write(JSON.stringify(data,null,2));await writable.close();return true}catch(e){console.warn('Could not save database file:',e);setStatus('Changes are saved locally, but could not write to the database file.',false);return false}}return true}
function autoSaveDatabase(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistDatabase(),150)}
function openFile(){
  if(isIOS||!('showOpenFilePicker' in window)){
    let input=document.getElementById('jsonFileInput');
    if(!input){input=document.createElement('input');input.type='file';input.id='jsonFileInput';input.accept='.json,application/json';input.style.display='none';document.body.appendChild(input);
      input.addEventListener('change',async()=>{const file=input.files&&input.files[0];if(!file)return;try{data=JSON.parse(await file.text());fileHandle=null;normalize();persistLocal();databaseReady=true;render();setStatus('Database imported from '+file.name+'. Changes are saved on this device.',true)}catch(e){alert('Could not open the database: '+e.message)}finally{input.value=''}})}
    input.click();return;
  }
  showOpenDatabasePicker();
}
async function showOpenDatabasePicker(){try{[fileHandle]=await window.showOpenFilePicker({types:[{description:'JSON database',accept:{'application/json':['.json']}}],multiple:false});const file=await fileHandle.getFile();data=JSON.parse(await file.text());normalize();persistLocal();databaseReady=true;render();setStatus('Database opened: '+file.name+'. Changes will save automatically.',true)}catch(e){if(e.name!=='AbortError')alert('Could not open the database: '+e.message)}}
async function saveFile(){if(isFileDatabaseOpen()){await persistDatabase();setStatus('Database saved.',true);return}persistLocal();download();setStatus('Database saved on this device and exported as data.json.',true)}
function download(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='data.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function loadBundledData(){
  try{const saved=localStorage.getItem('creditCardManagerData');if(saved){data=JSON.parse(saved);normalize();databaseReady=true;render();setStatus('Local database loaded.',true);return}}catch(e){console.warn('Could not load local database:',e)}
  fetch('data.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(json=>{data=json;normalize();databaseReady=true;render();setStatus('Database ready. Open Database to select your own data.json file.',true)}).catch(e=>{normalize();render();setStatus('Could not load the starter database: '+e.message,false)})
}
function normalize(){data.cards=(data.cards||[]).map(c=>({...c,startingBalance:Number(c.startingBalance||0),creditLimit:Number(c.creditLimit||0),apr:Number(c.apr||0),minimumPayment:Number(c.minimumPayment||0),transactions:Array.isArray(c.transactions)?c.transactions:[]}))}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active')});
$('#openBtn').onclick=openFile;$('#saveBtn').onclick=saveFile;$('#downloadBtn').onclick=download;$('#addCardBtn').onclick=addCard;$('#addCardDash').onclick=addCard;$('#addTxBtn').onclick=addTx;$('#closeModal').onclick=closeModal;$('#txCardFilter').onchange=renderTransactions;$('#txTypeFilter').onchange=renderTransactions;$('#payoffFrequency').onchange=calculatePayoff;$('#customPayment').oninput=calculatePayoff;$('#calculateBtn').onclick=calculatePayoff;loadBundledData();
