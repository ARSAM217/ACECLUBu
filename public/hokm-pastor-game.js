/* ACE CLUB — حکم پاستور، کلاینت آنلاین چهار نفره */
(function(){
 'use strict';
 let roomId=null, pollTimer=null, roomState=null, busy=false;
 const suits={S:'♠',H:'♥',D:'♦',C:'♣'}, suitNames={S:'پیک',H:'دل',D:'خشت',C:'گشنیز'};
 const rankNames={11:'J',12:'Q',13:'K',14:'A'};
 const fa=n=>Number(n||0).toLocaleString('fa-IR');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cardLabel=c=>(rankNames[c.rank]||c.rank)+suits[c.suit];
 const stop=()=>{if(pollTimer){clearInterval(pollTimer);pollTimer=null;}};
 const post=(url,body={})=>api(url,{method:'POST',body});
 const frame=(html)=>{document.body.classList.add('hokm-mode');shell(`${topbar('حکم پاستور')}<main class="content hokm-page">${html}</main>`);};
 function home(){
  stop();roomId=null;roomState=null;frame(`<section class="hokm-hero"><div class="hokm-emblem">♠<span>ACE</span></div><div><small>ACE CLUB · CARD ARENA</small><h1>حکم پاستور</h1><p>چهار بازیکن واقعی، دو تیم دونفره و رقابت تا امتیاز ۷</p></div></section>
  <section class="hokm-entry-grid"><button class="hokm-entry-card" id="hokmCreate"><b>＋</b><strong>ساخت اتاق خصوصی</strong><small>کد دعوت اختصاصی بساز و دوستانت را دعوت کن</small></button><div class="hokm-entry-card"><b>⌁</b><strong>ورود با کد دعوت</strong><small>کد ۶ رقمی اتاق دوستت را وارد کن</small><input id="hokmCode" maxlength="6" placeholder="مثلاً A7K9PX" autocomplete="off"><button class="hokm-primary" id="hokmJoin">ورود به اتاق</button></div></section>
  <div class="hokm-rules"><b>قوانین سریع</b><p>ابتدا ۵ کارت پخش می‌شود؛ حاکم حکم را انتخاب می‌کند و سپس ۸ کارت دیگر می‌گیرد. هر بازیکن باید از خال شروع‌شده پیروی کند. هر دست ۱۳ بازی دارد و تیمی که زودتر به ۷ امتیاز برسد، مسابقه را می‌برد.</p><small>در این نسخه فقط چهار بازیکن واقعی وارد مسابقه می‌شوند؛ ربات نمایشی وجود ندارد.</small></div>`);
  $('#hokmCreate')?.addEventListener('click',async()=>{try{const d=await post('/hokm/rooms');openRoom(d.room.id)}catch(e){toast(e.message)}});
  $('#hokmJoin')?.addEventListener('click',async()=>{const code=$('#hokmCode')?.value?.trim();if(!code){toast('کد دعوت را وارد کن');return}try{const d=await post('/hokm/join',{code});openRoom(d.room.id)}catch(e){toast(e.message)}});
 }
 async function openRoom(id){roomId=Number(id);await refresh();stop();pollTimer=setInterval(()=>{if(!busy&&document.visibilityState!=='hidden')refresh()},2200);}
 async function refresh(){if(!roomId)return;try{const d=await api('/hokm/rooms/'+roomId);roomState=d.room;draw()}catch(e){stop();toast(e.message);home()}}
 function playerName(p){return esc(p?.name||'بازیکن')}
 function draw(){
  const r=roomState;if(!r)return;
  const me=r.players.find(p=>p.seat===r.mySeat),isHakim=r.mySeat===r.hakimSeat;
  const teamA=r.players.filter(p=>p.team===0),teamB=r.players.filter(p=>p.team===1);
  const playerCard=p=>`<div class="hokm-player ${p.seat===r.turnSeat&&r.status==='playing'?'is-turn':''} ${p.seat===r.mySeat?'is-me':''}"><i>${p.seat===r.mySeat?'شما':p.online?'●':'○'}</i><b>${playerName(p)}</b><small>${p.seat===r.hakimSeat?'👑 حاکم':p.team===0?'تیم A':'تیم B'} · ${p.online?'متصل':'قطع'}</small></div>`;
  const at=offset=>r.players.find(p=>p.seat===(r.mySeat+offset+4)%4);
  const seats={top:playerCard(at(2)),left:playerCard(at(3)),right:playerCard(at(1)),bottom:playerCard(at(0))};
  const hand=[...(r.hand||[])].sort((a,b)=>['S','H','D','C'].indexOf(a.suit)-['S','H','D','C'].indexOf(b.suit)||a.rank-b.rank).map(c=>`<button class="hokm-card ${['H','D'].includes(c.suit)?'red':'black'}" data-card-suit="${c.suit}" data-card-rank="${c.rank}" ${r.stage!=='playing'||r.turnSeat!==r.mySeat?'disabled':''}><span>${rankNames[c.rank]||c.rank}</span><strong>${suits[c.suit]}</strong></button>`).join('');
  const trick=(r.trick||[]).map(x=>`<div class="hokm-played-card"><b>${cardLabel(x.card)}</b><small>${playerName(r.players.find(p=>p.seat===x.seat))}</small></div>`).join('');
  frame(`<section class="hokm-room-head"><div><small>اتاق خصوصی</small><h2>حکم پاستور</h2></div><button class="hokm-code" id="hokmCopy">${r.code} ⧉</button></section>
  <section class="hokm-scoreboard"><div><small>تیم A · صندلی ۱ و ۳</small><strong>${fa(r.roundScore?.[0]||0)}</strong><em>${teamA.map(playerName).join(' و ')||'—'}</em></div><div class="hokm-score-vs">VS</div><div><small>تیم B · صندلی ۲ و ۴</small><strong>${fa(r.roundScore?.[1]||0)}</strong><em>${teamB.map(playerName).join(' و ')||'—'}</em></div></section>
  <section class="hokm-table"><div class="hokm-seat-top">${seats.top}</div><div class="hokm-seat-middle"><div class="hokm-seat-side">${seats.left}</div><div class="hokm-table-center"><div class="hokm-trump">${r.trump?`حکم: <b class="${['H','D'].includes(r.trump)?'red':''}">${suits[r.trump]} ${suitNames[r.trump]}</b>`:'حکم هنوز انتخاب نشده'}</div><div class="hokm-trick">${trick||'<span>کارت‌های این دور اینجا نمایش داده می‌شوند</span>'}</div><div class="hokm-turn">${r.stage==='waiting'?'در انتظار چهار بازیکن واقعی…':r.stage==='choose-trump'?'مرحله انتخاب خال حکم':r.stage==='finished'?`برنده مسابقه: تیم ${r.winnerTeam===0?'A':'B'}`:`نوبت: ${playerName(r.players.find(p=>p.seat===r.turnSeat))}`}</div></div><div class="hokm-seat-side">${seats.right}</div></div><div class="hokm-seat-bottom">${seats.bottom}</div><div class="hokm-hand-info">کارت‌های باقی‌مانده: ${fa((r.hand||[]).length)} · دست شماره ${fa(r.dealNo||0)}</div><div class="hokm-hand">${hand}</div></section>
  ${r.status==='waiting'?`<div class="hokm-wait"><b>${fa(r.players.length)} از ۴ بازیکن</b><p>کد دعوت را برای سه بازیکن دیگر بفرست. بازی پس از ورود نفر چهارم خودکار شروع می‌شود.</p></div>`:''}
  ${r.stage==='choose-trump'&&isHakim?`<section class="hokm-trump-pick"><b>حاکم هستی؛ خال حکم را انتخاب کن</b><div>${Object.entries(suits).map(([s,v])=>`<button data-trump="${s}" class="${['H','D'].includes(s)?'red':''}">${v} ${suitNames[s]}</button>`).join('')}</div></section>`:''}
  ${r.stage==='choose-trump'&&!isHakim?'<div class="hokm-wait">منتظر انتخاب حکم توسط حاکم…</div>':''}
  ${r.stage==='finished'?`<div class="hokm-result"><h3>🏆 مسابقه تمام شد</h3><p>تیم ${r.winnerTeam===0?'A':'B'} برنده شد.</p><button class="hokm-primary" id="hokmHome">بازگشت به بازی‌ها</button></div>`:''}
  <button class="hokm-exit" id="hokmExit">خروج از اتاق</button>`);
  $('#hokmCopy')?.addEventListener('click',()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(r.code).then(()=>toast('کد دعوت کپی شد')).catch(()=>toast('کد دعوت: '+r.code));else toast('کد دعوت: '+r.code);});
  document.querySelectorAll('[data-trump]').forEach(b=>b.addEventListener('click',()=>chooseTrump(b.dataset.trump)));
  document.querySelectorAll('[data-card-suit]').forEach(b=>b.addEventListener('click',()=>playCard(b.dataset.cardSuit,Number(b.dataset.cardRank))));
  $('#hokmExit')?.addEventListener('click',async()=>{if(!confirm('از اتاق خارج می‌شوی؟'))return;try{await post('/hokm/rooms/'+roomId+'/leave');}catch{}home()});
  $('#hokmHome')?.addEventListener('click',home);
 }
 async function chooseTrump(trump){if(busy)return;busy=true;try{const d=await post('/hokm/rooms/'+roomId+'/trump',{trump});roomState=d.room;draw()}catch(e){toast(e.message)}finally{busy=false}}
 async function playCard(suit,rank){if(busy)return;busy=true;try{const actionId=(window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`);const d=await post('/hokm/rooms/'+roomId+'/play',{suit,rank,actionId});roomState=d.room;draw()}catch(e){toast(e.message)}finally{busy=false}}
 window.hokmPastorScreen=home;
 window.hokmOpenRoom=openRoom;
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&roomId)refresh()});
})();
