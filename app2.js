function calculatePayoff(){
  const cards=sortedCards().filter(c=>balance(c)>0.005), frequency=$('#payoffFrequency').value||'monthly';
  const entered=Number($('#customPayment').value)||0, mins=cards.reduce((s,c)=>s+(Number(c.minimumPayment)||0),0);
  const payment=entered>0?entered:(frequency==='weekly'?mins*12/52:mins), label=frequency==='weekly'?'week':'month';
  if(!cards.length){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Status</small><strong>All cards are paid off</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(payment<=0){$('#payoffSummary').innerHTML='<div class="summary-box"><small>Total payment</small><strong>Enter a payment</strong></div>';$('#amortizationTable').innerHTML='';return}
  if(frequency==='monthly'&&payment+0.005<mins){$('#payoffSummary').innerHTML=`<div class="summary-box"><small>Payment too low</small><strong>Minimums: ${money(mins)} / month</strong></div>`;$('#amortizationTable').innerHTML='<div class="empty">Your monthly payment must cover the minimum payments for all cards.</div>';return}
  const s=cards.map(c=>({card:c,bal:balance(c),rate:Math.pow(1+Number(c.apr||0)/100,1/12)-1,min:Number(c.minimumPayment)||0,paidMin:0}));
  const startDebt=s.reduce((a,x)=>a+x.bal,0);let totalInterest=0,totalPaid=0,period=0;const max=frequency==='weekly'?5200:1200;
  const today=new Date();
  today.setHours(12,0,0,0);
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
  let date=firstPaymentDate();
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
        date=nextDue&&nextDue<regular?nextDue:regular;
      }else{
        date=dueDateForMonth(date.getFullYear(),date.getMonth()+1,anchorDay);
      }
    }
    const month=date.getMonth(),year=date.getFullYear(),newMonth=month!==lastMonth||year!==lastYear;
    const start=new Map(s.map(x=>[x.card.id,x.bal])), interest=new Map(s.map(x=>[x.card.id,0])), paid=new Map(s.map(x=>[x.card.id,0]));
    if(frequency==='monthly'||newMonth){
      for(const x of s)x.paidMin=0;
      for(const x of s.filter(x=>x.bal>0.005)){const v=x.bal*x.rate;x.bal+=v;interest.set(x.card.id,v);totalInterest+=v}
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
  $('#payoffSummary').innerHTML=[['Total payment',money(payment)+' / '+label],['Payoff time',payoff],['Estimated payoff',complete?date.toLocaleDateString():'—'],['Total interest',money(totalInterest)],['Total paid',money(totalPaid)],['Starting debt',money(startDebt)]].map(x=>`<div class="summary-box"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
  const groups=new Map();display.forEach(r=>{if(!groups.has(r.period))groups.set(r.period,{period:r.period,date:r.date,rows:[]});groups.get(r.period).rows.push(r)});
  const word=frequency==='weekly'?'Week':'Month';
  $('#amortizationTable').innerHTML=[...groups.values()].map(g=>`<section class="payoff-period"><div class="payoff-period-head"><strong>${word} ${g.period}</strong><span>Payment date: ${g.date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span></div><div class="payoff-period-body">${g.rows.map(x=>`<details class="payoff-payment"><summary><div class="payoff-main-row"><div class="payoff-card-name"><strong>${esc(x.card)}</strong></div><div class="payoff-main-value"><span>Payment</span><strong>${money(x.payment)}</strong></div><div class="payoff-main-value"><span>Recommended</span><strong>${x.recommendedDate.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</strong></div><div class="payoff-details-label">Details <span>▾</span></div></div></summary><div class="payoff-details"><div><span>Scheduled payment</span><strong>${x.date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</strong></div><div><span>Due date</span><strong>${x.dueDate.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</strong></div><div><span>Starting balance</span><strong>${money(x.start)}</strong></div><div><span>Interest</span><strong>${money(x.interest)}</strong></div><div><span>Payment made</span><strong>${money(x.payment)}</strong></div><div><span>Ending balance</span><strong>${money(x.end)}</strong></div></div></details>`}).join('')}</div></section>`).join('')||'<div class="empty">No payoff schedule.</div>';
}