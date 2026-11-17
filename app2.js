function calculatePayoff(){
  const cards=sortedCards().filter(c=>balance(c)>0.005), frequency=$('#payoffFrequency').value||'monthly';
  const entered=Number($('#customPayment').value)||0, mins=cards.reduce((s,c)=>s+(cardMinimum(c)),0);
  const payment=entered>0?entered:(frequency==='weekly'?mins*12/52:mins), label=frequency==='weekly'?'week':'month';
  if(!cards.length){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Status</small><strong>All cards are paid off</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(payment<=0){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Total payment</small><strong>Enter a payment</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(frequency==='monthly'&&payment+0.005<mins){$('#payoffSummary').innerHTML=`<div class="summary-box"><small>Payment too low</small><strong>Minimums: ${money(mins)} / month</strong></div>`;$('#amortizationTable').innerHTML='<div class="empty">Your monthly payment must cover the minimum payments for all cards.</div>';return}
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
    let rem=payment;
    const smallest=s.filter(x=>x.bal>0.005).sort((a,b)=>a.bal-b.bal)[0];
    if(smallest&&rem+0.005>=smallest.bal){const v=smallest.bal;smallest.bal=0;rem-=v;totalPaid+=v;paid.set(smallest.card.id,v);smallest.paidMin=smallest.min}
    if(frequency==='monthly'){
      for(const x of s.filter(x=>x.bal>0.005)){const due=Math.max(0,x.min-x.paidMin),v=Math.min(rem,due,x.bal);x.bal-=v;x.paidMin+=v;rem-=v;totalPaid+=v;paid.set(x.card.id,(paid.get(x.card.id)||0)+v);if(rem<=0.005)break}
    }else{
      const end=new Date(date.getFullYear(),date.getMonth()+1,0),days=Math.max(0,Math.ceil((end-date)/86400000)),weeks=Math.max(1,Math.ceil((days+1)/7));
      let budget=Math.min(rem,s.reduce((a,x)=>a+Math.max(0,x.min-x.paidMin),0)/weeks);
      for(const x of s.filter(x=>x.bal>0.005)){const due=Math.max(0,x.min-x.paidMin),v=Math.min(budget,due,x.bal);x.bal-=v;x.paidMin+=v;budget-=v;rem-=v;totalPaid+=v;paid.set(x.card.id,(paid.get(x.card.id)||0)+v);if(budget<=0.005)break}
    }
    for(const x of s.filter(x=>x.bal>0.005).sort((a,b)=>a.bal-b.bal)){if(rem<=0.005)break;const v=Math.min(rem,x.bal);x.bal-=v;rem-=v;totalPaid+=v;paid.set(x.card.id,(paid.get(x.card.id)||0)+v)}
    for(const x of s.slice().sort((a,b)=>a.bal-b.bal)){const st=start.get(x.card.id)||0,v=interest.get(x.card.id)||0,p=paid.get(x.card.id)||0;if(st>0.005||p>0.005||x.bal>0.005){const d=Number(x.card.dueDay);let due=d>=1&&d<=31?dueDateForMonth(year,month,d):new Date(date);let recommended=new Date(due);recommended.setDate(recommended.getDate()-3);if(recommended<date)recommended=new Date(date);display.push({period,date:new Date(date),recommendedDate:recommended,dueDate:due,card:x.card.name,start:st,interest:v,payment:p,end:x.bal})}}
    lastMonth=month;lastYear=year;
  }
  const complete=!s.some(x=>x.bal>0.005), payoff=complete?(frequency==='weekly'?`${period} weeks (${(period/52).toFixed(1)} years)`:`${period} months (${(period/12).toFixed(1)} years)`):'>100 '+(frequency==='weekly'?'weeks':'years');
  $('#payoffSummary').innerHTML='<div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg></span><small>Payoff time</small><strong>'+payoff+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 8-8"/></svg></span><small>Estimated payoff</small><strong>'+(complete?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—')+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M19 5 5 19"/></svg></span><small>Total interest</small><strong>'+money(totalInterest)+'</strong></div><div class="compact-payoff-stat"><span class="compact-stat-icon"><svg class="payoff-metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/></svg></span><small>Total cost</small><strong>'+money(totalPaid)+'</strong></div>';
  const groups=new Map();display.forEach(r=>{if(!groups.has(r.period))groups.set(r.period,{period:r.period,date:r.date,rows:[]});groups.get(r.period).rows.push(r)});
  const word=frequency==='weekly'?'Week':'Month';
  $('#amortizationTable').innerHTML=[...groups.values()].map(g=>{
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
      '<div class="payoff-period-body">'+rows+'</div></details>';
  }).join('')||'<div class="empty">No payoff schedule.</div>';
}
// Initialize the optional manual first payment date to the next seven-day payday.
(function(){const field=document.querySelector('#firstPaymentDate');if(!field)return;const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+7);const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');field.value=local;field.addEventListener('change',()=>calculatePayoff());})();
