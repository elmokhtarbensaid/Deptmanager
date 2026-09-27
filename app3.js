let fileHandle=null;
function openFile(){
  let input=document.getElementById('jsonFileInput');
  if(!input){
    input=document.createElement('input');
    input.type='file';
    input.id='jsonFileInput';
    input.accept='.json,application/json';
    input.style.display='none';
    document.body.appendChild(input);
    input.addEventListener('change',async()=>{
      const file=input.files&&input.files[0];
      if(!file)return;
      try{
        data=JSON.parse(await file.text());
        fileHandle=null;
        normalize();
        render();
        setStatus('Opened '+file.name+'. On iPhone, use Download JSON to save changes.',true);
      }catch(e){
        alert('Could not open the JSON file: '+e.message);
      }finally{
        input.value='';
      }
    });
  }
  input.click();
}
async function saveFile(){
  if(fileHandle&&fileHandle.createWritable){
    try{
      const writable=await fileHandle.createWritable();
      await writable.write(JSON.stringify(data,null,2));
      await writable.close();
      setStatus('Saved successfully to the same JSON file.',true);
      return;
    }catch(e){
      alert('Could not save the file: '+e.message);
      return;
    }
  }
  download();
  setStatus('A new data.json file was downloaded. On iPhone, replace your old file with this downloaded copy.',true);
}
function download(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function loadBundledData(){
  try{
    const response=await fetch('data.json',{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    data=await response.json();
    fileHandle=null;
    normalize();
    render();
    setStatus('Loaded the data.json file included with this app.',true);
  }catch(e){
    setStatus('Could not load the bundled data.json: '+e.message,false);
  }
}
function normalize(){data.cards=(data.cards||[]).map(c=>({...c,startingBalance:Number(c.startingBalance||0),transactions:c.transactions||[]}))}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.tab).classList.add('active')});
$('#openBtn').onclick=openFile;
$('#saveBtn').onclick=saveFile;
$('#downloadBtn').onclick=download;
$('#addCardBtn').onclick=addCard;
$('#addCardDash').onclick=addCard;
$('#addTxBtn').onclick=addTx;
$('#closeModal').onclick=closeModal;
$('#txCardFilter').onchange=renderTransactions;
$('#txTypeFilter').onchange=renderTransactions;
$('#payoffFrequency').onchange=calculatePayoff;
$('#customPayment').oninput=calculatePayoff;
$('#calculateBtn').onclick=calculatePayoff;
normalize();
render();
