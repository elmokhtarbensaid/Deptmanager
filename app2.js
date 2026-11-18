// Payment overrides are keyed by frequency and schedule period and persist on this device.
function payoffOverrides(){return data?.payoffAdjustments||{weekly:[],monthly:[]}}
function payoffBudget(frequency,period,base){const entries=payoffOverrides()[frequency]||[];let amount=base;for(const a of entries.slice().sort((a,b)=>a.period-b.period)){if(a.period<=period&&(a.scope==='future'||a.period===period))amount=a.amount;else if(a.period>period)break;}return amount}
function payoffEdit(period,frequency,base){
 const current=payoffBudget(frequency,period,base);
 const amount=prompt('Payment amount for '+(frequency==='weekly'?'Week ':'Month ')+period,Number(current).toFixed(2));
 if(amount===null)return;
 const value=Number(amount);
 if(!Number.isFinite(value)||value<=0){alert('Enter a valid payment amount.');return}
 const scope=confirm('Apply '+value.toLocaleString('en-US',{style:'currency',currency:'USD'})+' to this and ALL following periods?\\nOK = all following periods\\nCancel = only this period');
 const state=JSON.parse(JSON.stringify(payoffOverrides())),entries=state[frequency]||[];
 state[frequency]=entries.filter(a=>a.period!==period).concat([{period,amount:value,scope:scope?'future':'once'}]).sort((a,b)=>a.period-b.period);
 data.payoffAdjustments=state;autoSaveDatabase();calculatePayoff();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-payoff-edit]');if(!b)return;e.preventDefault();e.stopPropagation();payoffEdit(Number(b.dataset.payoffEdit),b.dataset.frequency,Number(b.dataset.base))});
function calculatePayoff(){
  const cards=sortedCards().filter(c=>balance(c)>0.005), frequency=$('#payoffFrequency').value||'monthly';
  const entered=Number($('#customPayment').value)||0, mins=cards.reduce((s,c)=>s+(cardMinimum(c)),0);
  const payment=entered>0?entered:(frequency==='weekly'?mins*12/52:mins), label=frequency==='weekly'?'week':'month';
  if(!cards.length){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Status</small><strong>All cards are paid off</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(payment<=0){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Total payment</small><strong>Enter a payment</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(frequency==='monthly'&&payment+0.005<mins){$('#payoffSummary').innerHTML=`<div class="summary-box"><small>Payment too low</small><strong>Minimums: ${money(mins)} / month</strong></div>`;$('#amortizationTable').innerHTML='<div class="empty">Your monthly payment must cover the minimum payments for all cards.</div>';return}
  // Historical periods use recorded transactions; future periods use today's balances.
  // This prevents already-recorded payments from being deducted a second time.
  const historyStartValue=$('#firstPaymentDate')?.value;
  const historyStart=historyStartValue?new Date(historyStartValue+'T12:00:00'):null;
  const now=new Date();now.setHours(12,0,0,0);
  const historical=[];
  const periodDays=frequency==='weekly'?7:null;
  if(historyStart&&Number.isFinite(historyStart.getTime())&&historyStart<=now){
    let cursor=new Date(historyStart),count=0;
    while(cursor<=now&&count<5200){
      const end=new Date(cursor);
      if(frequency==='weekly')end.setDate(end.getDate()+7);
      else end.setMonth(end.getMonth()+1);
      const endExclusive=end;
      const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
      const from=iso(cursor),until=iso(endExclusive);
      const entries=(data.cards||[]).flatMap(c=>(c.transactions||[]).filter(t=>t.type==='payment'&&t.date>=from&&t.date<until).map(t=>({card:c.name,amount:Math.max(0,Number(t.amount)||0),date:t.date,id:t.id})));
      const actual=entries.reduce((sum,t)=>sum+t.amount,0);
      if(end<=now||entries.length){historical.push({period:++count,date:new Date(cursor),entries,actual,complete:end<=now});}else break;
      cursor=end;
    }
  }
  const s=cards.map(c=>({card:c,bal:balance(c),rate:Math.pow(1+Number(c.apr||0)/100,1/12)-1,min:cardMinimum(c),paidMin:0}));
  const startDebt=s.reduce((a,x)=>a+x.bal,0);let totalInterest=0,totalPaid=0,period=0;const max=frequency==='weekly'?5200:1200;
  const today=new Date();
  today.setHours(12,0,0,0);
  const paydayInput=$('#firstPaymentDate');
  const selectedDate=paydayInput?.value;
  const manualStart=selectedDate?new Date(selectedDate+'T12:00:00'):null;
  const dueDays=s.map(x=>Number(x.card.dueDay)).filter(d=>d>=1&&d<=31);
  const anchorDay=dueDays.length?Math.min(...dueDays):today.getDate();
  function dueDateForMonth(year,month,day){
    const last=new Date(year,month+1,0).getDate();
    return new Date(year,month,Math.min(day,last),12,0,0,0);
  }
  function firstPaymentDate(){
    const currentDue=dueDateForMonth(today.getFullYear(),today.getMonth(),anchorDay);
    return currentDue>=today?currentDue:dueDateForMonth(today.getFullYear(),today.getMonth()+1,anchorDay);
  }
  let date=manualStart&&Number.isFinite(manualStart.getTime())?manualStart:firstPaymentDate();
  if(historical.length){
    date=new Date(historical[historical.length-1].date);
    if(frequency==='weekly')date.setDate(date.getDate()+7);
    else date.setMonth(date.getMonth()+1);
  }
  let lastMonth=date.getMonth(),lastYear=date.getFullYear(),display=[];
  while(s.some(x=>x.bal>0.005)&&period<max){
    period++;
    if(period>1){
      if(frequency==='weekly'){
        const regular=new Date(date);
        regular.setDate(regular.getDate()+7);
        let nextDue=null;
        for(const x of s.filter(x=>x.bal>0.005)){
          const d=Number(x.card.dueDay);
          if(d<1||d>31)continue;
          let candidate=dueDateForMonth(regular.getFullYear(),regular.getMonth(),d);
          if(candidate<regular)candidate=dueDateForMonth(regular.getFullYear(),regular.getMonth()+1,d);
          if(!nextDue||candidate<nextDue)nextDue=candidate;
        }
        date=manualStart?regular:(nextDue&&nextDue<regular?nextDue:regular);
      }else{
        date=dueDateForMonth(date.getFullYear(),date.getMonth()+1,anchorDay);
      }
    }
    const month=date.getMonth(),year=date.getFullYear(),newMonth=month!==lastMonth||year!==lastYear;
    const start=new Map(s.map(x=>[x.card.id,x.bal])), interest=new Map(s.map(x=>[x.card.id,0])), paid=new Map(s.map(x=>[x.card.id,0]));
    if(frequency==='monthly'||newMonth){
      for(const x of s)x.paidMin=0;
      for(const x of s.filter(x=>x.bal>0.005)){const v=x.bal*x.rate;x.bal+=v;interest.set(x.card.id,v);totalInterest+=v;x.min=cardMinimum(x.card,x.bal,v)}
      lastMonth=month;lastYear=year;
    }
    let rem=payoffBudget(frequency,period+historical.length,payment);
    // Priority 1: completely clear every balance below $150, smallest first.
    // Only spend available funds; never let the payment budget go negative.
    for(const x of s.filter(x=>x.bal>0.005&&x.bal<150).sort((a,b)=>a.bal-b.bal)){
      if(rem+0.005<x.bal)continue;
      const v=x.bal;
      x.bal=0;rem=Math.max(0,rem-v);totalPaid+=v;
      paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
      x.paidMin=x.min;
    }
    // Priority 2: satisfy minimums on all remaining balances.
    if(frequency==='monthly'){
      for(const x of s.filter(x=>x.bal>0.005)){
        const due=Math.max(0,x.min-x.paidMin),v=Math.min(rem,due,x.bal);
        x.bal-=v;x.paidMin+=v;rem-=v;totalPaid+=v;
        paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
        if(rem<=0.005)break;
      }
    }else{
      const end=new Date(date.getFullYear(),date.getMonth()+1,0);
      const days=Math.max(0,Math.ceil((end-date)/86400000));
      const weeks=Math.max(1,Math.ceil((days+1)/7));
      let budget=Math.min(rem,s.reduce((a,x)=>a+Math.max(0,x.min-x.paidMin),0)/weeks);
      for(const x of s.filter(x=>x.bal>0.005)){
        const due=Math.max(0,x.min-x.paidMin),v=Math.min(budget,due,x.bal);
        x.bal-=v;x.paidMin+=v;budget-=v;rem-=v;totalPaid+=v;
        paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
        if(budget<=0.005)break;
      }
    }
    // Priority 3: debt avalanche: highest APR first, then next-highest.
    for(const x of s.filter(x=>x.bal>0.005).sort((a,b)=>Number(b.card.apr||0)-Number(a.card.apr||0)||a.bal-b.bal)){
      if(rem<=0.005)break;
      const v=Math.min(rem,x.bal);
      x.bal-=v;rem-=v;totalPaid+=v;
      paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
    }
    for(const x of s.slice().sort((a,b)=>a.bal-b.bal)){const st=start.get(x.card.id)||0,v=interest.get(x.card.id)||0,p=paid.get(x.card.id)||0;if(st>0.005||p>0.005||x.bal>0.005){const d=Number(x.card.dueDay);let due=d>=1&&d<=31?dueDateForMonth(year,month,d):new Date(date);let recommended=new Date(due);recommended.setDate(recommended.getDate()-3);if(recommended<date)recommended=new Date(date);display.push({period,date:new Date(date),recommendedDate:recommended,dueDate:due,card:x.card.name,start:st,interest:v,payment:p,end:x.bal})}}
    lastMonth=month;lastYear=year;
  }
  const pastCount=historical.length;
  const complete=!s.some(x=>x.bal>0.005), fullPeriods=period+pastCount, payoff=complete?(frequency==='weekly'?fullPeriods+' weeks ('+(fullPeriods/52).toFixed(1)+' years)':fullPeriods+' months ('+(fullPeriods/12).toFixed(1)+' years)'):'>100 '+(frequency==='weekly'?'weeks':'years');
  $('#payoffSummary').innerHTML='<div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg></span><small>Payoff time</small><strong>'+payoff+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 8-8"/></svg></span><small>Estimated payoff</small><strong>'+(complete?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—')+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M19 5 5 19"/></svg></span><small>Total interest</small><strong>'+money(totalInterest)+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/></svg></span><small>Total cost</small><strong>'+money(totalPaid)+'</strong></div>';
  const groups=new Map();display.forEach(r=>{const key=r.period+pastCount;if(!groups.has(key))groups.set(key,{period:key,date:r.date,rows:[]});groups.get(key).rows.push(r)});
  const word=frequency==='weekly'?'Week':'Month';
  const historyHtml=historical.map(g=>{
    const recorded=g.entries.map(t=>'<div class="payoff-history-transaction" style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #365576"><strong>'+esc(t.card)+'</strong><strong style="color:#83e9ba">'+money(t.amount)+'</strong></div>').join('');
    const target=payoffBudget(frequency,g.period,payment);
    const fullyPaid=g.actual+0.005>=target;
    const periodStyle=fullyPaid
      ?'background:linear-gradient(120deg,#145348 0%,#10463e 55%,#0c3834 100%) !important;background-color:#10463e !important;border:1px solid #31b78a !important;box-shadow:inset 0 1px 0 rgba(149,255,204,.12) !important'
      :g.actual>0.005
        ?'background:linear-gradient(120deg,#554116 0%,#483b19 55%,#302d20 100%) !important;background-color:#483b19 !important;border:1px solid #d6a83f !important;box-shadow:inset 0 1px 0 rgba(255,229,148,.12) !important'
        :'';
    return '<details class="payoff-period payoff-period-collapsible payoff-history-period"'+(periodStyle?' style="'+periodStyle+'"':'')+'>'+
      '<summary class="payoff-period-summary" style="background:transparent !important;background-color:transparent !important;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1.5fr) auto;align-items:center">'+
      '<span class="payoff-period-summary-item"><small>Period</small><strong>'+(frequency==='weekly'?'Week ':'Month ')+g.period+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Payment day</small><strong>'+g.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Recorded payments</small><strong>'+money(g.actual)+'</strong></span>'+
      '<span class="payoff-period-chevron" aria-hidden="true">▾</span></summary>'+
      '<div class="payoff-period-body"><p>Recorded payments for this period. Target: '+money(payoffBudget(frequency,g.period,payment))+'.</p>'+
      (recorded||'<div class="empty">No payments recorded in this period.</div>')+'</div></details>';
  }).join('');
  $('#amortizationTable').innerHTML=historyHtml+[...groups.values()].map(g=>{
    const remaining=g.rows.reduce((sum,x)=>sum+x.end,0);
    const rows=g.rows.map(x=>{
      return '<details class="payoff-payment"><summary><div class="payoff-main-row">'+
        '<div class="payoff-card-name"><strong>'+esc(x.card)+'</strong></div>'+
        '<div class="payoff-main-value"><span>Payment</span><strong>'+money(x.payment)+'</strong></div>'+
        '<div class="payoff-main-value"><span>Recommended</span><strong>'+x.recommendedDate.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</strong></div>'+
        '<div class="payoff-details-label">Details <span>▾</span></div>'+
        '</div></summary>'+
        '<div class="payoff-details">'+
        '<div><span>Scheduled payment</span><strong>'+x.date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</strong></div>'+
        '<div><span>Due date</span><strong>'+x.dueDate.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</strong></div>'+
        '<div><span>Starting balance</span><strong>'+money(x.start)+'</strong></div>'+
        '<div><span>Interest</span><strong>'+money(x.interest)+'</strong></div>'+
        '<div><span>Payment made</span><strong>'+money(x.payment)+'</strong></div>'+
        '<div><span>Ending balance</span><strong>'+money(x.end)+'</strong></div>'+
        '</div></details>';
    }).join('');
    return '<details class="payoff-period payoff-period-collapsible">'+
      '<summary class="payoff-period-summary">'+
      '<span class="payoff-period-summary-item"><small>Period</small><strong>'+word+' '+g.period+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Payment day</small><strong>'+g.date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Remaining balance</small><strong>'+money(remaining)+'</strong></span>'+
      '<span class="payoff-period-chevron" aria-hidden="true">▾</span></summary>'+
      '<div class="payoff-period-body"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 4px 14px"><span>Payment budget: <strong>'+money(payoffBudget(frequency,g.period,payment))+'</strong></span><button type="button" data-payoff-edit="'+g.period+'" data-frequency="'+frequency+'" data-base="'+payment+'" style="padding:8px 12px;border:1px solid #4d9df2;border-radius:9px;background:#1251a0;color:white;font-weight:700;cursor:pointer">✎ Change payment</button></div>'+rows+'</div></details>';
  }).join('')||'<div class="empty">No payoff schedule.</div>';
}
// Initialize the optional manual first payment date to the next seven-day payday.
(function(){const field=document.querySelector('#firstPaymentDate');if(!field)return;const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+7);const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');field.value=local;field.addEventListener('change',()=>calculatePayoff());})();
