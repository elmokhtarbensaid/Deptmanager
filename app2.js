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

// Card-specific payment overrides apply to one schedule period only.
// All other allocations are recomputed within that period's existing budget.
function payoffCardOverrides(){return data?.payoffCardAdjustments||{}}
function payoffCardEdit(period,frequency,cardId,cardName,amount,budget){
 const key=frequency+':'+period, all=payoffCardOverrides(), current=all[key]||{};
 const other=Object.entries(current).reduce((sum,[id,v])=>sum+(id===cardId?0:Math.max(0,Number(v)||0)),0);
 const entered=prompt('Payment for '+cardName+' in '+(frequency==='weekly'?'Week ':'Month ')+period+' (budget '+money(budget)+'). Enter an amount, or leave blank to restore automatic allocation.',Number(amount).toFixed(2));
 if(entered===null)return;
 const next=entered.trim()===''?null:Number(entered);
 if(next!==null&&(!Number.isFinite(next)||next<0||Math.round((next+other)*100)>Math.round(budget*100))){
   alert('Invalid amount. Fixed card payments cannot exceed the period budget ('+money(budget)+').');return;
 }
 const updated={...all}, entries={...current};
 if(next===null)delete entries[cardId];else entries[cardId]=Math.round(next*100)/100;
 if(Object.keys(entries).length)updated[key]=entries;else delete updated[key];
 data.payoffCardAdjustments=updated;autoSaveDatabase();calculatePayoff();
}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-payoff-card-edit]');if(!btn)return;
 e.preventDefault();e.stopPropagation();
 payoffCardEdit(Number(btn.dataset.period),btn.dataset.frequency,btn.dataset.payoffCardEdit,btn.dataset.cardName,Number(btn.dataset.amount),Number(btn.dataset.budget));
});
function calculatePayoff(){
  const cards=sortedCards().filter(c=>balance(c)>0.005), frequency=$('#payoffFrequency').value||'monthly';
  const entered=Number($('#customPayment').value)||0, mins=cards.reduce((s,c)=>s+(cardMinimum(c)),0);
  const payment=entered>0?entered:(frequency==='weekly'?mins*12/52:mins), label=frequency==='weekly'?'week':'month';
  if(!cards.length){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Status</small><strong>All cards are paid off</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(payment<=0){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Total payment</small><strong>Enter a payment</strong></div>';$('#amortizationTable').innerHTML='';return}
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
      if(end<=now||entries.length||cursor<=now){historical.push({period:++count,date:new Date(cursor),entries,actual,complete:end<=now});}else break;
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
  const dueWarnings=[];
  const isoDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  for(const x of s){
    const day=Number(x.card.dueDay);
    if(!(day>=1&&day<=31)){dueWarnings.push(x.card.name+': missing due date');x.nextDue=null;continue}
    let due=dueDateForMonth(today.getFullYear(),today.getMonth(),day);
    if(due<today)due=dueDateForMonth(today.getFullYear(),today.getMonth()+1,day);
    x.nextDue=due;
    const previous=dueDateForMonth(due.getFullYear(),due.getMonth()-1,day);
    x.paidMin=Math.min(x.min,(x.card.transactions||[]).filter(t=>t.type==='payment'&&t.date>isoDate(previous)&&t.date<=isoDate(today)).reduce((v,t)=>v+Math.max(0,Number(t.amount)||0),0));
    if(date>due&&x.min-x.paidMin>0.005)dueWarnings.push(x.card.name+': next payday is after '+isoDate(due));
  }
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
      // Minimum payments reset at each card's due date, not calendar month.
      for(const x of s.filter(x=>x.bal>0.005)){const v=x.bal*x.rate;x.bal+=v;interest.set(x.card.id,v);totalInterest+=v;x.min=cardMinimum(x.card,x.bal,v)}
      lastMonth=month;lastYear=year;
    }
    let rem=payoffBudget(frequency,period+historical.length,payment);
    const absolutePeriod=period+historical.length;
    const fixedPayments=payoffCardOverrides()[frequency+':'+absolutePeriod]||{};
    const fixedIds=new Set();
    // Reserve manual allocations before automatic minimums and APR prioritization.
    for(const x of s){
      if(!Object.prototype.hasOwnProperty.call(fixedPayments,x.card.id))continue;
      const requested=Math.max(0,Math.round((Number(fixedPayments[x.card.id])||0)*100)/100);
      const v=Math.min(rem,x.bal,requested);
      fixedIds.add(x.card.id);
      if(v>0.005){
        x.bal-=v;x.paidMin+=v;rem=Math.max(0,rem-v);totalPaid+=v;
        paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
      }
      if(requested>v+0.005)dueWarnings.push(x.card.name+': manual payment exceeds available budget or balance in '+(frequency==='weekly'?'Week ':'Month ')+absolutePeriod);
    }
    const nextPayDate=new Date(date);
    if(frequency==='weekly')nextPayDate.setDate(nextPayDate.getDate()+7);
    else nextPayDate.setMonth(nextPayDate.getMonth()+1);
    for(const x of s.filter(x=>x.nextDue)){
      while(x.nextDue<date){
        if(x.bal>0.005&&x.paidMin+0.005<x.min)dueWarnings.push(x.card.name+': '+money(x.min-x.paidMin)+' short by '+isoDate(x.nextDue));
        x.paidMin=0;
        x.nextDue=dueDateForMonth(x.nextDue.getFullYear(),x.nextDue.getMonth()+1,Number(x.card.dueDay));
      }
    }
    // Consolidate minimum payments: pay a card when its deadline requires it,
    // or earlier only when future payment budgets cannot cover all due minimums.
    const obligations=s.filter(x=>x.bal>0.005&&x.nextDue&&!fixedIds.has(x.card.id)).sort((a,b)=>a.nextDue-b.nextDue);
    const availableFutureBefore=deadline=>{
      let total=0,day=new Date(nextPayDate),step=1;
      while(day<=deadline&&step<=60){
        total+=payoffBudget(frequency,period+historical.length+step,payment);
        if(frequency==='weekly')day.setDate(day.getDate()+7);
        else day.setMonth(day.getMonth()+1);
        step++;
      }
      return total;
    };
    // Reserve only the amount that cannot safely wait for later paydays.
    // Use cumulative deadlines so several cards share the same future budget.
    let cumulativeDue=0,committedNow=0;
    for(const x of obligations){
      const outstanding=Math.max(0,Math.min(x.bal,x.min-x.paidMin));
      if(outstanding<=0.005)continue;
      cumulativeDue+=outstanding;
      const futureCapacity=availableFutureBefore(x.nextDue);
      const neededNow=Math.max(0,cumulativeDue-futureCapacity-committedNow);
      const v=Math.min(rem,x.bal,outstanding,Math.ceil(neededNow*100)/100);
      if(v>0.005){
        x.bal-=v;x.paidMin+=v;rem-=v;totalPaid+=v;committedNow+=v;
        paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
      }
      if(x.nextDue<nextPayDate&&v+0.005<outstanding){
        dueWarnings.push(x.card.name+': '+money(outstanding-v)+' minimum shortfall by '+isoDate(x.nextDue));
      }
    }
    // Only use remaining funds to clear small balances.
    for(const x of s.filter(x=>x.bal>0.005&&x.bal<150&&!fixedIds.has(x.card.id)).sort((a,b)=>a.bal-b.bal)){
      if(rem+0.005<x.bal)continue;
      const v=x.bal;
      x.bal=0;rem=Math.max(0,rem-v);totalPaid+=v;
      paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
      x.paidMin=Math.max(x.paidMin,x.min);
    }
    // Priority 3: debt avalanche: highest APR first, then next-highest.
    for(const x of s.filter(x=>x.bal>0.005&&!fixedIds.has(x.card.id)).sort((a,b)=>Number(b.card.apr||0)-Number(a.card.apr||0)||a.bal-b.bal)){
      if(rem<=0.005)break;
      const v=Math.min(rem,x.bal);
      x.bal-=v;rem-=v;totalPaid+=v;
      x.paidMin=Math.min(x.min,x.paidMin+v);
      paid.set(x.card.id,(paid.get(x.card.id)||0)+v);
    }
    for(const x of s.slice().sort((a,b)=>a.bal-b.bal)){const st=start.get(x.card.id)||0,v=interest.get(x.card.id)||0,p=paid.get(x.card.id)||0;if(st>0.005||p>0.005||x.bal>0.005){const d=Number(x.card.dueDay);let due=x.nextDue?new Date(x.nextDue):(d>=1&&d<=31?dueDateForMonth(year,month,d):new Date(date));let recommended=new Date(date);display.push({period,date:new Date(date),recommendedDate:recommended,dueDate:due,card:x.card.name,cardId:x.card.id,start:st,interest:v,payment:p,end:x.bal})}}
    lastMonth=month;lastYear=year;
  }
  const pastCount=historical.length;
  const complete=!s.some(x=>x.bal>0.005), fullPeriods=period+pastCount, payoff=complete?(frequency==='weekly'?fullPeriods+' weeks ('+(fullPeriods/52).toFixed(1)+' years)':fullPeriods+' months ('+(fullPeriods/12).toFixed(1)+' years)'):'>100 '+(frequency==='weekly'?'weeks':'years');
  $('#payoffSummary').innerHTML='<div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg></span><small>Payoff time</small><strong>'+payoff+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 8-8"/></svg></span><small>Estimated payoff</small><strong>'+(complete?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—')+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M19 5 5 19"/></svg></span><small>Total interest</small><strong>'+money(totalInterest)+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/></svg></span><small>Total cost</small><strong>'+money(totalPaid)+'</strong></div>';
  const warningsHtml=dueWarnings.length?'<div role="alert" style="margin:12px 0;padding:12px 14px;border:1px solid #e4a43a;border-radius:10px;background:#4b3218;color:#ffe1a1"><strong>⚠ Minimum payment warning</strong>'+[...new Set(dueWarnings)].slice(0,12).map(w=>'<div style="margin-top:5px">'+esc(w)+'</div>').join('')+'<small>Check bank statement due dates and minimums. This planner does not make payments.</small></div>':'';
  const groups=new Map();display.forEach(r=>{const key=r.period+pastCount;if(!groups.has(key))groups.set(key,{period:key,date:r.date,rows:[]});groups.get(key).rows.push(r)});
  const word=frequency==='weekly'?'Week':'Month';
  const historyHtml=historical.map(g=>{
    const endExclusive=new Date(g.date);
    if(frequency==='weekly')endExclusive.setDate(endExclusive.getDate()+7);
    else endExclusive.setMonth(endExclusive.getMonth()+1);
    const endISO=[endExclusive.getFullYear(),String(endExclusive.getMonth()+1).padStart(2,'0'),String(endExclusive.getDate()).padStart(2,'0')].join('-');
    // Reconstruct the ledger balance at period end from current balances and later transactions.
    const historicalRemaining=(data.cards||[]).reduce((sum,c)=>{
      const futureDelta=(c.transactions||[]).filter(t=>t.date>=endISO).reduce((v,t)=>v+txSigned(t),0);
      return sum+Math.max(0,balance(c)-futureDelta);
    },0);
    const recorded=g.entries.map(t=>{
      const paidDate=new Date(t.date+'T12:00:00');
      const dateText=Number.isFinite(paidDate.getTime())?paidDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):esc(t.date);
      const card=(data.cards||[]).find(c=>c.name===t.card&&(c.transactions||[]).some(tx=>tx.id===t.id));
      const ordered=card?(card.transactions||[]).map((tx,i)=>({tx,i})).sort((a,b)=>String(a.tx.date||'').localeCompare(String(b.tx.date||''))||a.i-b.i):[];
      let running=Number(card?.startingBalance||0),starting=null,ending=null;
      for(const item of ordered){
        const tx=item.tx;
        if(tx.id===t.id&&tx.type==='payment'){starting=Math.max(0,running);ending=Math.max(0,running+txSigned(tx));break;}
        running+=txSigned(tx);
      }
      const day=Number(card?.dueDay);
      const due=day>=1&&day<=31&&Number.isFinite(paidDate.getTime())?dueDateForMonth(paidDate.getFullYear(),paidDate.getMonth(),day):null;
      if(due&&due<paidDate)due.setTime(dueDateForMonth(paidDate.getFullYear(),paidDate.getMonth()+1,day).getTime());
      const fmt=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set';
      return '<details class="payoff-payment payoff-recorded-payment" style="background:transparent !important;background-color:transparent !important"><summary style="background:transparent !important;background-color:transparent !important"><div class="payoff-main-row">'+
        '<div class="payoff-card-name"><strong>'+esc(t.card)+'</strong></div>'+
        '<div class="payoff-main-value"><span>Payment</span><strong style="color:#83e9ba">'+money(t.amount)+'</strong></div>'+
        '<div class="payoff-main-value"><span>Paid on</span><strong>'+dateText+'</strong></div>'+
        '<div class="payoff-details-label">Details <span>▾</span></div>'+
        '</div></summary><div class="payoff-details" style="background:transparent !important;background-color:transparent !important">'+
        '<div><span>Payment date</span><strong>'+dateText+'</strong></div>'+
        '<div><span>Amount paid</span><strong style="color:#83e9ba">'+money(t.amount)+'</strong></div>'+
        '<div><span>Ending balance</span><strong>'+(ending===null?'Unavailable':money(ending))+'</strong></div>'+
        '</div></details>';
    }).join('');
    const target=payoffBudget(frequency,g.period,payment);
    const fullyPaid=g.actual+0.005>=target;
    const unallocated=Math.max(0,Math.round((target-g.actual)*100)/100);
    // Only recommend an additional payment for the active period; past periods are history.
    let extraSuggestion='';
    if(unallocated>0.005&&g.date<=now&&now<endExclusive){
      const nextPayday=new Date(endExclusive);
      const candidates=cards.map(c=>{
        const outstanding=balance(c);
        const dueDay=Number(c.dueDay);
        if(outstanding<=0.005)return null;
        if(!(dueDay>=1&&dueDay<=31))return {card:c,bal:outstanding,due:null,needed:0,missing:true};
        let due=dueDateForMonth(now.getFullYear(),now.getMonth(),dueDay);
        if(due<now)due=dueDateForMonth(now.getFullYear(),now.getMonth()+1,dueDay);
        const prev=dueDateForMonth(due.getFullYear(),due.getMonth()-1,dueDay);
        const paid=(c.transactions||[]).filter(t=>t.type==='payment'&&t.date>isoDate(prev)&&t.date<=isoDate(now)).reduce((sum,t)=>sum+Math.max(0,Number(t.amount)||0),0);
        return {card:c,bal:outstanding,due,needed:Math.max(0,cardMinimum(c)-paid),missing:false};
      }).filter(Boolean);
      const urgent=candidates.filter(x=>x.due&&x.due<nextPayday&&x.needed>0.005).sort((a,b)=>a.due-b.due);
      const allocations=[];
      let available=unallocated;
      for(const x of urgent){
        if(available<=0.005)break;
        const amount=Math.min(available,x.needed,x.bal);
        if(amount<=0.005)continue;
        allocations.push({name:x.card.name,amount,reason:'Minimum due '+x.due.toLocaleDateString('en-US',{month:'short',day:'numeric'})});
        available=Math.max(0,available-amount);
      }
      if(available>0.005){
        const ranked=candidates.filter(x=>x.bal>0.005).sort((a,b)=>{
          const as=a.bal<150?0:1,bs=b.bal<150?0:1;
          return as-bs||(as===0?a.bal-b.bal:Number(b.card.apr||0)-Number(a.card.apr||0));
        });
        for(const x of ranked){
          if(available<=0.005)break;
          const already=allocations.filter(a=>a.name===x.card.name).reduce((sum,a)=>sum+a.amount,0);
          const amount=Math.min(available,Math.max(0,x.bal-already));
          if(amount<=0.005)continue;
          allocations.push({name:x.card.name,amount,reason:x.bal<150?'Small balance payoff':'Highest APR remaining'});
          available=Math.max(0,available-amount);
        }
      }
      // Display pending allocations using the exact same expandable card layout as future weeks.
      extraSuggestion=allocations.map(a=>{
        const candidate=candidates.find(x=>x.card.name===a.name);
        const c=candidate?.card;
        if(!c)return '';
        const bal=candidate.bal,amount=a.amount,ending=Math.max(0,bal-amount);
        const due=candidate.due;
        const recommended=due?new Date(due):new Date(now);
        if(due)recommended.setDate(recommended.getDate()-3);
        if(recommended<now)recommended.setTime(now.getTime());
        const fmt=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set';
        return '<details class="payoff-payment payoff-pending-payment" style="background:transparent !important;background-color:transparent !important">'+
          '<summary style="background:transparent !important;background-color:transparent !important"><div class="payoff-main-row">'+
          '<div class="payoff-card-name"><strong>'+esc(a.name)+'</strong></div>'+
          '<div class="payoff-main-value"><span>Payment</span><strong>'+money(amount)+'</strong></div>'+
          '<div class="payoff-main-value"><span>Recommended</span><strong>'+fmt(recommended)+'</strong></div>'+
          '<div class="payoff-details-label">Details <span>▾</span></div></div></summary>'+
          '<div class="payoff-details" style="background:transparent !important;background-color:transparent !important">'+
          '<div><span>Scheduled payment</span><strong>'+fmt(now)+'</strong></div>'+
          '<div><span>Due date</span><strong>'+fmt(due)+'</strong></div>'+
          '<div><span>Starting balance</span><strong>'+money(bal)+'</strong></div>'+
          '<div><span>Interest</span><strong>Not yet posted</strong></div>'+
          '<div><span>Payment to make</span><strong>'+money(amount)+'</strong></div>'+
          '<div><span>Estimated ending balance</span><strong>'+money(ending)+'</strong></div>'+
          '</div></details>';
      }).join('');
      if(available>0.005)extraSuggestion+='<div style="padding:10px;color:#ffe1a1">Unallocated budget: '+money(available)+'</div>';

    }
    const periodStyle=fullyPaid
      ?'background:linear-gradient(120deg,#145348 0%,#10463e 55%,#0c3834 100%) !important;background-color:#10463e !important;border:1px solid #31b78a !important;box-shadow:inset 0 1px 0 rgba(149,255,204,.12) !important'
      :g.actual>0.005
        ?'background:linear-gradient(120deg,#554116 0%,#483b19 55%,#302d20 100%) !important;background-color:#483b19 !important;border:1px solid #d6a83f !important;box-shadow:inset 0 1px 0 rgba(255,229,148,.12) !important'
        :'';
    return '<details class="payoff-period payoff-period-collapsible payoff-history-period"'+(periodStyle?' style="'+periodStyle+'"':'')+'>'+
      '<summary class="payoff-period-summary" style="background:transparent !important;background-color:transparent !important;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1.5fr) auto;align-items:center">'+
      '<span class="payoff-period-summary-item"><small>Period</small><strong>'+(frequency==='weekly'?'Week ':'Month ')+g.period+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Payment day</small><strong>'+g.date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'</strong></span>'+
      '<span class="payoff-period-summary-item"><small>Remaining balance</small><strong>'+money(historicalRemaining)+'</strong></span>'+
      '<span class="payoff-period-chevron" aria-hidden="true">▾</span></summary>'+
      '<div class="payoff-period-body"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 4px 14px"><span>Payment budget: <strong>'+money(target)+'</strong></span><span style="color:'+(fullyPaid?'#83e9ba':'#f3ce7b')+';font-weight:700">Recorded: '+money(g.actual)+'</span></div>'+
      recorded+extraSuggestion+'</div></details>';
  }).join('');
  $('#amortizationTable').innerHTML=warningsHtml+historyHtml+[...groups.values()].map(g=>{
    const remaining=g.rows.reduce((sum,x)=>sum+x.end,0);
    const periodBudget=payoffBudget(frequency,g.period,payment);
    const manualIds=payoffCardOverrides()[frequency+':'+g.period]||{};
    const rows=g.rows.filter(x=>x.payment>0.005||Object.prototype.hasOwnProperty.call(manualIds,x.cardId)).map(x=>{
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
        '<div><span>Manual adjustment</span><button type="button" data-payoff-card-edit="'+esc(String(x.cardId))+'" data-card-name="'+esc(x.card)+'" data-period="'+g.period+'" data-frequency="'+frequency+'" data-amount="'+x.payment+'" data-budget="'+periodBudget+'" style="padding:6px 10px;border:1px solid #4d9df2;border-radius:8px;background:#1251a0;color:#fff;cursor:pointer">✎ Edit this card payment</button></div>''+
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
