let data={version:1,cards:[]}; let fileHandle=null;
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const uid=p=>p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
function txSigned(t){ return ['payment','credit'].includes(t.type)?-Number(t.amount):Number(t.amount); }
function balance(card){ return Math.max(0, Number(card.startingBalance||0) + card.transactions.reduce((b,t)=>b+txSigned(t),0)); }

function cardMinimum(card, outstanding=balance(card), billedInterest=null){
 const B=Math.max(0,Number(outstanding)||0); if(B<0.005)return 0;
 const name=(String(card.name||'')+' '+String(card.issuer||'')).toLowerCase();
 const I=Math.max(0,billedInterest===null?B*Math.max(0,Number(card.apr)||0)/1200:Number(billedInterest)||0);
 const base=Math.max(0,B-I), cents=x=>Math.round((x+Number.EPSILON)*100)/100, whole=x=>Math.round(x), ceil=x=>Math.ceil(x-1e-9);
 let due;
 if(/ready now|overdraft/.test(name))due=Math.max(18,B*.02);
 else if(/mercury/.test(name))due=Math.max(15,cents(base*.01+I));
 else if(/apple/.test(name))due=Math.max(25,ceil(B*.01+I));
 else if(/costco|citi/.test(name))due=Math.max(35,whole(base*.01)+I,whole(base*.015));
 else if(/capital one|quicksilver|platinum/.test(name))due=Math.max(25,whole(base*.01+I));
 else if(/truist|spectrum/.test(name))due=Math.max(27,whole(base*.01+I));
 else if(/chase|slate/.test(name))due=Math.max(40,whole(base*.01+I));
 else if(/ollo|merrick/.test(name))due=Math.max(25,ceil(base*.01+I));
 else due=Math.max(25,ceil(base*.01+I));
 return cents(Math.min(B,due));
}
function sortedTx(card){return [...(card.transactions||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
function sortedCards(){return [...(data.cards||[])].sort((a,b)=>balance(a)-balance(b)||String(a.name||'').localeCompare(String(b.name||'')));}
function monthlyRate(apr){return Math.pow(1+Number(apr)/100,1/12)-1}
function setStatus(msg,good=false){$('#status').textContent=msg;$('#status').style.borderColor=good?'#86efac':'#e5e7eb'}
function render(){
  const cards=sortedCards(), total=cards.reduce((s,c)=>s+balance(c),0), limits=cards.reduce((s,c)=>s+Number(c.creditLimit||0),0);
  const min=cards.reduce((s,c)=>s+cardMinimum(c),0);
  const interest=cards.reduce((s,c)=>s+balance(c)*Number(c.apr||0)/100/12,0);
  const util=limits?total/limits*100:0;
  $('#stats').innerHTML=[['Total debt',money(total)],['Credit limit',money(limits)],['Utilization',util.toFixed(1)+'%'],['Monthly minimums',money(min)],['Est. monthly interest',money(interest)]].map(x=>`<div class="stat"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
  $('#dashboardCards').innerHTML=cards.length?cards.map(card=>{const b=balance(card),lim=Number(card.creditLimit)||0,pct=lim?Math.min(100,b/lim*100):0;return `<div class="account-card"><h3>${esc(card.name)}</h3><div class="muted">${esc(card.issuer||'')}</div><div class="balance">${money(b)}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="mini"><span>${pct.toFixed(1)}% used</span><span>${Number(card.apr||0).toFixed(2)}% APR</span></div><div class="mini"><span>Min ${money(cardMinimum(card))}</span><span>Due day ${card.dueDay||'—'}</span></div></div>`}).join(''):'<div class="empty">No credit cards yet.</div>';
  $('#cardsTable').innerHTML=cards.length?cards.map(c=>`<tr><td data-label="Card"><strong>${esc(c.name)}</strong><br><span class="muted">${esc(c.issuer||'')}</span></td><td data-label="Balance">${money(balance(c))}</td><td data-label="Limit">${money(c.creditLimit)}</td><td data-label="APR">${Number(c.apr||0).toFixed(2)}%</td><td data-label="Minimum">${money(cardMinimum(c))}</td><td data-label="Due">${c.dueDay||'—'}</td><td data-label="Actions" class="actions"><button class="secondary" onclick="editCard('${c.id}')">Edit</button><button class="danger" onclick="deleteCard('${c.id}')">Delete</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No cards.</td></tr>';
  const opts=cards.map(c=>`<option value="${c.id}">${esc(c.name)} — ${money(balance(c))}</option>`).join('');
  $('#txCardFilter').innerHTML='<option value="">All cards</option>'+opts;
  renderTransactions(); calculatePayoff();
}
function renderTransactions(){
  const cf=$('#txCardFilter').value,tf=$('#txTypeFilter').value,month=document.querySelector('#txMonthFilter')?.value||'',rows=[];
  for(const c of data.cards||[]){if(cf&&c.id!==cf)continue;let running=Number(c.startingBalance)||0;for(const t of sortedTx(c)){running+=txSigned(t);if(tf&&t.type!==tf)continue;if(month&&!String(t.date||'').startsWith(month))continue;rows.push({...t,card:c.name,balanceAfter:Math.max(0,running)});}}
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  const tbody=$('#txTable');
  if(!rows.length){tbody.innerHTML='<tr class="tx-empty"><td colspan="7" class="empty">No transactions match these filters.</td></tr>';return}
  const icons={
    payment:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    credit:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m9 12 2 2 4-4"/>',
    purchase:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l3 13h13l2-9H5"/>',
    interest:'<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M19 5 5 19"/>',
    fee:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>'
  };
  const svg=type=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[type]||icons.fee)+'</svg>';
  const formatDate=date=>{const d=new Date(String(date)+'T12:00:00');return Number.isNaN(d.getTime())?date:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
  tbody.innerHTML=rows.map(t=>{
    const positive=['payment','credit'].includes(t.type);
    const type=t.type==='purchase'?'Purchase':t.type==='credit'?'Credit':t.type==='fee'?'Fee':t.type.charAt(0).toUpperCase()+t.type.slice(1);
    const label=type+' – '+(t.description||t.card);
    const id=String(t.id).replace(/[^a-zA-Z0-9_-]/g,'');
    return '<tr class="tx-compact-row" data-tx-id="'+esc(id)+'" tabindex="0" role="button" aria-expanded="false" aria-label="Show details for '+esc(label)+'">'+
      '<td class="tx-main" colspan="7"><span class="tx-row-icon tx-icon-'+esc(t.type)+'">'+svg(t.type)+'</span><span class="tx-row-copy"><strong>'+esc(label)+'</strong><small>'+esc(formatDate(t.date))+'</small></span><strong class="tx-row-amount '+(positive?'positive':'')+'">'+(positive?'-':'')+money(t.amount)+'</strong><span class="tx-chevron" aria-hidden="true">›</span></td>'+
      '<td class="tx-expanded" colspan="7"><div class="tx-detail-grid"><span>Card <strong>'+esc(t.card)+'</strong></span><span>Balance after <strong>'+money(t.balanceAfter)+'</strong></span></div><div class="tx-row-actions"><button type="button" class="secondary" data-tx-action="edit">Edit</button><button type="button" class="danger" data-tx-action="delete">Delete</button></div></td></tr>';
  }).join('');
  tbody.querySelectorAll('.tx-compact-row').forEach((tr,i)=>{
    const t=rows[i];
    function toggle(){const open=tr.classList.toggle('expanded');tr.setAttribute('aria-expanded',String(open))}
    tr.querySelector('.tx-main').addEventListener('click',toggle);
    tr.addEventListener('keydown',e=>{if(e.target===tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle()}});
    tr.querySelector('[data-tx-action="edit"]').addEventListener('click',e=>{e.stopPropagation();editTx(t.card,t.id)});
    tr.querySelector('[data-tx-action="delete"]').addEventListener('click',e=>{e.stopPropagation();deleteTx(t.card,t.id)});
  });
}

function showModal(title,body){$('#modalTitle').textContent=title;$('#modalForm').innerHTML=body;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden')}
function cardForm(c={}){return `<div class="form-grid"><div class="form-field"><label>Card name<input name="name" required value="${esc(c.name||'')}"></label></div><div class="form-field"><label>Issuer<input name="issuer" value="${esc(c.issuer||'')}"></label></div><div class="form-field"><label>Starting balance<input name="startingBalance" type="number" min="0" step=".01" value="${c.startingBalance??0}"></label></div><div class="form-field"><label>Credit limit<input name="creditLimit" type="number" min="0" step=".01" required value="${c.creditLimit??''}"></label></div><div class="form-field"><label>APR (%)<input name="apr" type="number" min="0" step=".01" required value="${c.apr??''}"></label></div><div class="form-field"><label>Due day (1-31)<input name="dueDay" type="number" min="1" max="31" value="${c.dueDay??''}"></label></div><div class="form-field"><label>Statement closing day<input name="closingDay" type="number" min="1" max="31" value="${c.closingDay??''}"></label></div></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Card</button></div>`}
function addCard(){showModal('Add Credit Card',cardForm());$('#modalForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);data.cards.push({id:uid('card'),name:f.get('name'),issuer:f.get('issuer'),startingBalance:+f.get('startingBalance')||0,creditLimit:+f.get('creditLimit'),apr:+f.get('apr'),dueDay:+f.get('dueDay')||null,closingDay:+f.get('closingDay')||null,transactions:[]});closeModal();render();autoSaveDatabase();setStatus('Card added and saved.',true)}}
function editCard(id){const c=data.cards.find(x=>x.id===id);if(!c)return;showModal('Edit Credit Card',cardForm(c));$('#modalForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);Object.assign(c,{name:f.get('name'),issuer:f.get('issuer'),startingBalance:+f.get('startingBalance')||0,creditLimit:+f.get('creditLimit'),apr:+f.get('apr'),dueDay:+f.get('dueDay')||null,closingDay:+f.get('closingDay')||null});closeModal();render();autoSaveDatabase();setStatus('Card updated and saved.',true)}}
function deleteCard(id){const c=data.cards.find(x=>x.id===id);if(confirm(`Delete ${c?.name||'this card'} and all its transactions?`)){data.cards=data.cards.filter(x=>x.id!==id);render();autoSaveDatabase();setStatus('Card deleted and saved.',true)}}
function txForm(c={},cardId=''){const opts=sortedCards().map(x=>`<option value="${x.id}" ${x.id===cardId?'selected':''}>${esc(x.name)}</option>`).join('');return `<div class="form-grid"><div class="form-field"><label>Card<select name="cardId" required>${opts}</select></label></div><div class="form-field"><label>Date<input name="date" type="date" required value="${c.date||new Date().toISOString().slice(0,10)}"></label></div><div class="form-field"><label>Type<select name="type"><option value="purchase" ${c.type==='purchase'?'selected':''}>Spending</option><option value="payment" ${c.type==='payment'?'selected':''}>Payment</option><option value="interest" ${c.type==='interest'?'selected':''}>Interest charge</option><option value="fee" ${c.type==='fee'?'selected':''}>Late fee / fee</option><option value="credit" ${c.type==='credit'?'selected':''}>Credit / adjustment</option></select></label></div><div class="form-field"><label>Amount<input name="amount" type="number" min="0.01" step=".01" required value="${c.amount??''}"></label></div><div class="form-field" style="grid-column:1/-1"><label>Description<input name="description" value="${esc(c.description||'')}"></label></div></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Transaction</button></div>`}
function addTx(){if(!data.cards.length)return alert('Add a credit card first.');showModal('Add Transaction',txForm({},sortedCards()[0].id));$('#modalForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),c=data.cards.find(x=>x.id===f.get('cardId'));c.transactions.push({id:uid('tx'),date:f.get('date'),type:f.get('type'),amount:+f.get('amount'),description:f.get('description')});closeModal();render();autoSaveDatabase();setStatus('Transaction added and saved.',true)}}
function editTx(cardName,id){let c=data.cards.find(x=>x.name===cardName),t=c?.transactions.find(x=>x.id===id);if(!t)return;showModal('Edit Transaction',txForm(t,c.id));$('#modalForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),nc=data.cards.find(x=>x.id===f.get('cardId'));if(nc.id!==c.id){c.transactions=c.transactions.filter(x=>x.id!==id);nc.transactions.push(t)}Object.assign(t,{date:f.get('date'),type:f.get('type'),amount:+f.get('amount'),description:f.get('description')});closeModal();render();autoSaveDatabase();setStatus('Transaction updated and saved.',true)}}
function deleteTx(cardName,id){const c=data.cards.find(x=>x.name===cardName);if(c&&confirm('Delete this transaction?')){c.transactions=c.transactions.filter(x=>x.id!==id);render();autoSaveDatabase();setStatus('Transaction deleted and saved.',true)}}