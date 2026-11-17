'use strict';

// ACE CLUB Rubika integration. Uses the existing ACE CLUB SQLite database.
function installRubikaBot({app, db, cfg, requireAuth, requireAdmin, rateLimit, adminPanelUnlocked, userById, addTx, allChallenges, challengePeriod, challengeMetrics, atomic, syncUserFameAndLevel, notify, logActivity, isAdmin, recordLoginDay}) {
  const TOKEN = String(cfg('RUBIKA_BOT_TOKEN') || '').trim();
  const BOT_USERNAME = String(cfg('RUBIKA_BOT_USERNAME') || '').trim().replace(/^@/, '');
  const API = 'https://botapi.rubika.ir/v3/';
  const enabled = !!TOKEN;
  db.exec(`
    CREATE TABLE IF NOT EXISTS rubika_links(
      chat_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE,
      sender_id TEXT DEFAULT '', linked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS rubika_processed_updates(
      update_key TEXT PRIMARY KEY, processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const api = async (method, payload={}) => {
    if (!TOKEN) throw new Error('توکن ربات تنظیم نشده است');
    const response = await fetch(API + TOKEN + '/' + method, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify(payload), signal:AbortSignal.timeout(12000)
    });
    const body = await response.json().catch(()=>({}));
    if (!response.ok || body.status !== 'OK') { const detail = JSON.stringify(body).replaceAll(TOKEN, '[TOKEN]').slice(0,700); throw new Error(`Rubika API HTTP ${response.status}: ${detail || 'empty response'}`); }
    return body.data || {};
  };
  const menuKeyboard = [
    ['📲 نصب اپلیکیشن','🛍️ فروشگاه'],
    ['🔎 اکسپلور افراد','📍 افراد نزدیک'],
    ['👤 پروفایل من','🪙 کیف پول و سکه'],
    ['🏆 چالش‌ها و جوایز','🔔 اعلانات'],
    ['🎧 پشتیبانی','🌐 ورود به سایت']
  ];
  const startKeyboard = [['📝 ثبت‌نام','🔐 ورود'],['🔗 ورود به حساب سایت'],['🌐 ورود به سایت']];
  const makeKeypad = rows => ({rows:rows.map((row,i)=>({buttons:row.map((label,j)=>({id:`ace_${i}_${j}`,type:'Simple',button_text:label}))}))});
  const menuKeypad = makeKeypad(menuKeyboard), startKeypad = makeKeypad(startKeyboard);
  const send = (chatId, text, keypad=menuKeypad) => api('sendMessage',{chat_id:String(chatId),text:String(text).slice(0,3500),...(keypad?{chat_keypad:keypad,chat_keypad_type:'New'}:{})});
  const linkForChat = chatId => db.prepare('SELECT l.*,u.username,u.display_name,u.coins,u.level,u.fame,u.xp,u.id AS uid FROM rubika_links l JOIN users u ON u.id=l.user_id WHERE l.chat_id=? AND l.active=1').get(String(chatId));
  const formatUser = u => `👤 ${u.display_name}\nشناسه: ${u.id}\nنام کاربری: @${u.username}\n⭐ سطح: ${u.level}\n🏅 شهرت: ${u.fame}\n🪙 سکه: ${Number(u.coins).toLocaleString('fa-IR')}`;
  const home = `✨ ACE CLUB | ایس کلاب\nدنیای ارتباطات و رقابت\n\nسلام، خوش اومدی! 👋\nاگر حساب ACE CLUB داری، ورود را بزن؛ اگر نداری، ثبت‌نام کن. حساب سایت و ربات یکی است.\n\n🔐 اطلاعات حساب فقط برای ورود به ایس کلاب استفاده می‌شود.\n🌐 https://aceclub.ir`;
  // Credentials are kept only in memory while the user completes the private-chat flow.
  const authFlows = new Map();
  const bcrypt = require('bcryptjs');
  const findUser = username => db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(String(username||''));
  const connectChat = (chatId, senderId, userId) => {
    const current = linkForChat(chatId);
    if (current && Number(current.user_id)!==Number(userId)) throw new Error('این گفت‌وگوی روبیکا از قبل به حساب دیگری متصل است.');
    const owner = db.prepare('SELECT chat_id FROM rubika_links WHERE user_id=? AND active=1').get(userId);
    if (owner && String(owner.chat_id)!==String(chatId)) throw new Error('این حساب قبلاً به یک حساب روبیکا متصل شده است.');
    db.prepare('INSERT INTO rubika_links(chat_id,user_id,sender_id,active) VALUES(?,?,?,1) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,sender_id=excluded.sender_id,active=1').run(String(chatId),Number(userId),String(senderId||''));
    authFlows.delete(String(chatId));
    return userById(userId);
  };
  const beginRegistration = chatId => { authFlows.set(String(chatId),{mode:'register',step:'username',data:{}}); return send(chatId,'📝 ثبت‌نام در ACE CLUB\n\nیک نام کاربری انگلیسی وارد کن (۳ تا ۲۴ حرف، عدد یا _):',null); };
  const beginLogin = chatId => { authFlows.set(String(chatId),{mode:'login',step:'username',data:{}}); return send(chatId,'🔐 ورود به حساب ACE CLUB\n\nنام کاربری حسابت را وارد کن:',null); };
  function createAccountFromBot(data) {
    const username=String(data.username||'').trim(), displayName=String(data.display_name||username).trim();
    if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new Error('نام کاربری معتبر نیست.');
    if(username.toLowerCase()==='owner') throw new Error('این نام کاربری رزرو شده است؛ نام دیگری انتخاب کن.');
    if(displayName.length<2||displayName.length>40) throw new Error('نام نمایشی باید بین ۲ تا ۴۰ نویسه باشد.');
    if(findUser(username)) throw new Error('این نام کاربری قبلاً ثبت شده است. یک نام دیگر انتخاب کن.');
    let uid=0;
    atomic(()=>{
      const priorReal=db.prepare("SELECT id FROM users WHERE username<>'OWNER' COLLATE NOCASE ORDER BY id LIMIT 1").get();
      const makeOwner=!priorReal;
      const result=db.prepare('INSERT INTO users(username,display_name,phone,password_hash,gender,age,province,coins,role) VALUES(?,?,NULL,?,?,?,?,?,?)').run(username,displayName,bcrypt.hashSync(String(data.password),12),'نامشخص',18,'',500,makeOwner?'owner':'user');
      uid=Number(result.lastInsertRowid);
      if(makeOwner) db.prepare("UPDATE users SET role='user' WHERE id<>? AND role IN ('owner','creator')").run(uid);
      if(makeOwner) db.prepare("UPDATE chat_groups SET owner_id=? WHERE name='گروه ایس کلاب'").run(uid);
      let official=db.prepare("SELECT id FROM chat_groups WHERE group_code='ACECLUB_OFFICIAL' OR name='گروه ایس کلاب' ORDER BY CASE WHEN group_code='ACECLUB_OFFICIAL' THEN 0 ELSE 1 END,id LIMIT 1").get();
      if(!official&&makeOwner){const gr=db.prepare('INSERT INTO chat_groups(name,group_code,description,owner_id) VALUES(?,?,?,?)').run('گروه ایس کلاب','ACECLUB_OFFICIAL','گروه همگانی رسمی ایس کلاب',uid);official={id:Number(gr.lastInsertRowid)};}
      if(official) db.prepare('INSERT OR IGNORE INTO chat_group_members(group_id,user_id,role) VALUES(?,?,?)').run(official.id,uid,makeOwner?'owner':'member');
      if(makeOwner&&official){db.prepare("UPDATE chat_group_members SET role='member' WHERE group_id=? AND user_id<>? AND role='owner'").run(official.id,uid);db.prepare("UPDATE chat_group_members SET role='owner' WHERE group_id=? AND user_id=?").run(official.id,uid);}
      db.prepare('UPDATE users SET terms_accepted_at=CURRENT_TIMESTAMP WHERE id=?').run(uid);
      logActivity(uid,uid,'register',makeOwner?'ثبت‌نام از ربات؛ اولین حساب و سازنده سایت':'ثبت‌نام از ربات و تأیید قوانین');
      addTx(uid,0,'signup','ثبت نام از ربات روبیکا');
      try{recordLoginDay?.(uid);}catch{}
      try{syncUserFameAndLevel(uid);}catch{}
    });
    return userById(uid);
  }
  async function handleMessage(update) {
    const u = update?.update || update;
    if (!u || u.type !== 'NewMessage' || !u.chat_id) return;
    const msg = u.new_message || {};
    const chatId = String(u.chat_id), senderId = String(msg.sender_id || '');
    const text = String(msg.text || '').trim();
    const key = String(u.update_id || `${chatId}:${msg.message_id || msg.time || ''}`);
    if (db.prepare('SELECT 1 FROM rubika_processed_updates WHERE update_key=?').get(key)) return;
    db.prepare('INSERT INTO rubika_processed_updates(update_key) VALUES(?)').run(key);
    db.prepare("DELETE FROM rubika_processed_updates WHERE processed_at < datetime('now','-14 days')").run();

    const existing = linkForChat(chatId);
    if (/^(\/start|شروع|سلام|منو|بازگشت)$/i.test(text)) {
      authFlows.delete(chatId);
      return existing ? send(chatId,`خوش برگشتی 👋\n\n${formatUser(userById(existing.user_id))}`) : send(chatId,home,startKeypad);
    }
    if (/^(لغو|انصراف)$/i.test(text)) { authFlows.delete(chatId); return send(chatId,'عملیات لغو شد. برای ادامه ثبت‌نام یا ورود را انتخاب کن.',startKeypad); }
    if (/^\/help$/i.test(text)) return send(chatId,'برای شروع /start را بفرست. ثبت‌نام و ورود از داخل همین ربات انجام می‌شود.',existing?menuKeypad:startKeypad);
    if (existing && /^(\/logout|قطع اتصال)$/i.test(text)) { db.prepare('DELETE FROM rubika_links WHERE chat_id=?').run(chatId); authFlows.delete(chatId); return send(chatId,'اتصال حساب روبیکا قطع شد. هر زمان خواستی با گزینه ورود دوباره متصل شو.',startKeypad); }

    if (!existing && text==='📝 ثبت‌نام') return beginRegistration(chatId);
    if (!existing && text==='🔐 ورود') return beginLogin(chatId);
    if (!existing && text==='🔗 ورود به حساب سایت') return beginLogin(chatId);
    const flow=authFlows.get(chatId);
    if (!existing && flow) {
      if (flow.mode==='register') {
        if(flow.step==='username'){
          if(!/^[a-zA-Z0-9_]{3,24}$/.test(text)) return send(chatId,'نام کاربری باید ۳ تا ۲۴ نویسه و فقط شامل حروف انگلیسی، عدد یا _ باشد. دوباره وارد کن:',null);
          if(text.toLowerCase()==='owner') return send(chatId,'این نام کاربری رزرو شده است. نام دیگری وارد کن:',null);
          if(findUser(text)) return send(chatId,'این نام کاربری قبلاً گرفته شده؛ یکی دیگر انتخاب کن:',null);
          flow.data.username=text; flow.step='display_name'; return send(chatId,'نام نمایشی خودت را وارد کن (۲ تا ۴۰ نویسه):',null);
        }
        if(flow.step==='display_name'){
          if(text.length<2||text.length>40) return send(chatId,'نام نمایشی باید بین ۲ تا ۴۰ نویسه باشد. دوباره وارد کن:',null);
          flow.data.display_name=text; flow.step='password'; return send(chatId,'یک رمز عبور بساز. حداقل ۸ نویسه و شامل حداقل یک حرف انگلیسی و یک عدد باشد.\n⚠️ این پیام را فقط در گفت‌وگوی خصوصی با ربات بفرست:',null);
        }
        if(flow.step==='password'){
          if(text.length<8||text.length>72||!/[A-Za-z]/.test(text)||!/[0-9]/.test(text)) return send(chatId,'رمز باید حداقل ۸ نویسه، حداکثر ۷۲ نویسه و شامل حرف انگلیسی و عدد باشد. دوباره وارد کن:',null);
          flow.data.password=text; flow.step='terms'; return send(chatId,'با قوانین و راهنمای استفاده از ACE CLUB موافقی؟\nبرای تأیید دقیقاً بنویس: «می‌پذیرم»\nبرای لغو بنویس: لغو',null);
        }
        if(flow.step==='terms'){
          if(text!=='می‌پذیرم') return send(chatId,'برای ساخت حساب باید قوانین را بپذیری. بنویس «می‌پذیرم» یا «لغو».',null);
          try {
            const user=createAccountFromBot(flow.data);
            const linked=connectChat(chatId,senderId,user.id);
            return send(chatId,`🎉 ثبت‌نام با موفقیت انجام شد!\nحساب تو ساخته شد و به همین ربات متصل شد.\n\n${formatUser(linked)}`);
          } catch(e) { authFlows.delete(chatId); return send(chatId,`ثبت‌نام انجام نشد: ${e.message}\nبرای تلاش دوباره /start را بفرست.`,startKeypad); }
        }
      }
      if (flow.mode==='login') {
        if(flow.step==='username'){
          if(!/^[a-zA-Z0-9_]{3,24}$/.test(text)) return send(chatId,'نام کاربری معتبر نیست. دوباره وارد کن:',null);
          flow.data.username=text; flow.step='password'; return send(chatId,'حالا رمز عبور حساب ACE CLUB را وارد کن.\n⚠️ فقط در گفت‌وگوی خصوصی با ربات:',null);
        }
        if(flow.step==='password'){
          let user=findUser(flow.data.username);
          if(!user||!bcrypt.compareSync(text,user.password_hash)){authFlows.delete(chatId);return send(chatId,'نام کاربری یا رمز عبور اشتباه است. برای تلاش دوباره /start را بفرست.',startKeypad);}
          if(user.is_banned && user.ban_until && Date.parse(user.ban_until)<=Date.now()){db.prepare('UPDATE users SET is_banned=0,ban_reason=NULL,ban_until=NULL WHERE id=?').run(user.id);user=userById(user.id);}
          if(user.is_banned){authFlows.delete(chatId);return send(chatId,user.ban_reason?`این حساب مسدود شده است: ${user.ban_reason}`:'این حساب مسدود شده است.',startKeypad);}
          try { const linked=connectChat(chatId,senderId,user.id); try{recordLoginDay?.(user.id);}catch{} logActivity(user.id,user.id,'rubika_login','ورود به حساب از ربات روبیکا'); return send(chatId,`✅ با موفقیت وارد شدی و همان حساب سایت به ربات متصل شد؛ اطلاعات و موجودی مشترک هستند.\n\n${formatUser(linked)}`); }
          catch(e){authFlows.delete(chatId);return send(chatId,e.message,startKeypad);}
        }
      }
      return;
    }
    if (!existing) return send(chatId,home,startKeypad);
    db.prepare('UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?').run(existing.user_id);
    const user = userById(existing.user_id);
    if (!user || user.is_banned) return send(chatId,'دسترسی این حساب در ACE CLUB فعال نیست.');
    if (text==='👤 پروفایل من') return send(chatId,formatUser(user)+`\n\n🔗 https://aceclub.ir/#profile`);
    if (text==='🪙 کیف پول و سکه') {
      const rows=db.prepare('SELECT amount,note,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 5').all(user.id);
      return send(chatId,`🪙 کیف پول ACE CLUB\nموجودی: ${Number(user.coins).toLocaleString('fa-IR')} سکه\n\nآخرین تراکنش‌ها:\n${rows.map(x=>`${Number(x.amount)>0?'+':''}${x.amount} · ${x.note||'تراکنش'} · ${x.created_at}`).join('\n')||'تراکنشی ثبت نشده است.'}`);
    }
    if (/^\/claim\s+([a-zA-Z0-9_-]+)$/i.test(text)) {
      const id=text.match(/^\/claim\s+([a-zA-Z0-9_-]+)$/i)[1], challenge=allChallenges().find(x=>x.id===id);
      if(!challenge) return send(chatId,'شناسه چالش معتبر نیست. از منوی چالش‌ها شناسه را بردار.');
      const period=challengePeriod(challenge), metrics=challengeMetrics(user.id);
      if(Number(metrics[challenge.metric]||0)<challenge.target) return send(chatId,'هنوز شرط این چالش از سمت سرور تکمیل نشده است.');
      if(challenge.sequence){const sequence=allChallenges().filter(x=>x.sequence===challenge.sequence).sort((a,b)=>a.target-b.target);const next=sequence.find(x=>!db.prepare('SELECT 1 FROM challenge_claims WHERE user_id=? AND challenge_id=? AND period_key=?').get(user.id,x.id,challengePeriod(x)));if(next&&next.id!==challenge.id)return send(chatId,'ابتدا مرحله قبلی این چالش را کامل کن.');}
      try{atomic(()=>{db.prepare('INSERT INTO challenge_claims(user_id,challenge_id,period_key,reward_coins,reward_fame) VALUES(?,?,?,?,?)').run(user.id,challenge.id,period,challenge.coins,challenge.fame);addTx(user.id,challenge.coins,'challenge_reward','جایزه مأموریت: '+challenge.title);syncUserFameAndLevel(user.id,{fame:Math.max(0,Number(userById(user.id)?.fame||0))+challenge.fame});});}catch{return send(chatId,'این جایزه قبلاً دریافت شده یا ثبت آن ناموفق بود.');}
      notify(user.id,'جایزه چالش',`${challenge.title}: ${challenge.coins} سکه و ${challenge.fame} شهرت دریافت کردی.`);
      return send(chatId,`🎉 جایزه ثبت شد!\n${challenge.title}\n🪙 ${challenge.coins} سکه · 🏅 ${challenge.fame} شهرت`);
    }
    if (text==='🏆 چالش‌ها و جوایز') {
      const metrics=challengeMetrics(user.id);
      const rows=allChallenges().slice(0,12).map(c=>{const period=challengePeriod(c),claimed=!!db.prepare('SELECT 1 FROM challenge_claims WHERE user_id=? AND challenge_id=? AND period_key=?').get(user.id,c.id,period),progress=Math.min(c.target,Number(metrics[c.metric]||0));return `${claimed?'✅':'▫️'} ${c.title} · ${progress}/${c.target} · ${c.coins} سکه · شناسه: ${c.id}${progress>=c.target&&!claimed?'\nبرای دریافت: /claim '+c.id:''}`;});
      return send(chatId,'🏆 چالش‌های شما\n'+(rows.join('\n')||'چالشی در دسترس نیست.')+'\n\nبرای دریافت جایزه، دستور /claim شناسه را ارسال کن.');
    }
    if (text==='🔔 اعلانات') {
      const rows=db.prepare('SELECT title,body,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 8').all(user.id);
      return send(chatId,'🔔 آخرین اعلانات\n'+(rows.map(x=>`• ${x.title}\n${x.body||''}\n${x.created_at}`).join('\n\n')||'اعلان جدیدی نداری.'));
    }
    if (text==='🔎 اکسپلور افراد') {
      const rows=db.prepare("SELECT id,display_name,username,level FROM users WHERE id<>? AND is_banned=0 AND account_privacy='public' ORDER BY last_seen DESC LIMIT 8").all(user.id);
      return send(chatId,'🔎 کاربران پیشنهادی\n'+(rows.map(x=>`• ${x.display_name} (@${x.username}) · سطح ${x.level} · #${x.id}`).join('\n')||'کاربری برای نمایش پیدا نشد.')+'\n\nمشاهده پروفایل‌ها: https://aceclub.ir/#explore');
    }
    if (text==='📍 افراد نزدیک') return send(chatId,'برای حفظ حریم خصوصی، موقعیت مکانی فقط از داخل سایت و با اجازه خودت بررسی می‌شود.\nhttps://aceclub.ir');
    if (text==='📲 نصب اپلیکیشن') return send(chatId,'📲 دریافت اپلیکیشن ACE CLUB\nhttps://aceclub.ir');
    if (text==='🛍️ فروشگاه') return send(chatId,'🛍️ فروشگاه ACE CLUB\nبرای مشاهده آیتم‌ها و خرید با سکه وارد سایت شو:\nhttps://aceclub.ir');
    if (text==='🌐 ورود به سایت') return send(chatId,'https://aceclub.ir');
    if (text==='🎧 پشتیبانی') { db.prepare("INSERT INTO tickets(user_id,subject) VALUES(?,'پشتیبانی از طریق ربات روبیکا')").run(user.id); const ticket=db.prepare('SELECT last_insert_rowid() id').get().id; db.prepare('INSERT INTO ticket_messages(ticket_id,sender_id,body) VALUES(?,?,?)').run(ticket,user.id,'کاربر درخواست پشتیبانی را از ربات روبیکا آغاز کرد.'); return send(chatId,`🎧 درخواست پشتیبانی ثبت شد.\nشماره تیکت: ${ticket}\nبرای ادامه گفتگو وارد سایت شو: https://aceclub.ir`); }
    return send(chatId,'از منوی پایین یکی از امکانات ACE CLUB را انتخاب کن.');
  }

  // The user connects an existing website account by logging in inside the private bot chat.
  // No temporary code, second account, or separate database is used.
  app.get('/api/rubika/status',requireAuth,(req,res)=>{
    const row=db.prepare('SELECT chat_id,linked_at FROM rubika_links WHERE user_id=? AND active=1').get(req.user.id);
    res.json({linked:!!row,linkedAt:row?.linked_at||null,enabled,botUsername:BOT_USERNAME});
  });
  app.delete('/api/rubika/link',requireAuth,(req,res)=>{
    db.prepare('DELETE FROM rubika_links WHERE user_id=?').run(req.user.id);
    res.json({ok:true});
  });

  // Admin API is additionally protected by the existing second admin-panel unlock.
  app.get('/api/admin/rubika',requireAuth,requireAdmin,(req,res)=>{
    if (!adminPanelUnlocked(req)) return res.status(423).json({error:'پنل مدیریت قفل است',adminLocked:true});
    res.json({enabled,configured:enabled,linked:db.prepare('SELECT COUNT(*) n FROM rubika_links WHERE active=1').get().n,users:db.prepare('SELECT COUNT(*) n FROM rubika_links l JOIN users u ON u.id=l.user_id WHERE l.active=1').get().n,botUsername:BOT_USERNAME,webhookMode:false});
  });
  app.post('/api/admin/rubika/broadcast',requireAuth,requireAdmin,async(req,res)=>{
    if (!adminPanelUnlocked(req)) return res.status(423).json({error:'پنل مدیریت قفل است',adminLocked:true});
    if (!enabled) return res.status(503).json({error:'توکن ربات تنظیم نشده است.'});
    const message=String(req.body?.message||'').trim().slice(0,1500);
    if (message.length<2) return res.status(400).json({error:'متن اعلان را وارد کن'});
    const chats=db.prepare('SELECT chat_id FROM rubika_links WHERE active=1').all();
    let sent=0,failed=0;
    for (const row of chats) { try { await send(row.chat_id,'📣 اطلاعیه ACE CLUB\n\n'+message,false); sent++; } catch { failed++; } }
    logActivity(req.user.id,null,'rubika_broadcast',`sent=${sent};failed=${failed}`);
    res.json({ok:true,sent,failed,total:chats.length});
  });

  let offsetId=String(db.prepare("SELECT value FROM settings WHERE key='rubika_offset_id'").get()?.value||''); let polling=false;
  async function poll() {
    if (!enabled || polling) return;
    polling=true;
    try {
      const data=await api('getUpdates',{limit:20,...(offsetId?{offset_id:offsetId}:{})});
      for (const update of (data.updates||[])) { try { await handleMessage(update); } catch(e) { console.error('ACE Rubika update failed:',e.message); } }
      if (data.next_offset_id) { offsetId=String(data.next_offset_id); db.prepare("INSERT INTO settings(key,value) VALUES('rubika_offset_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(offsetId); }
    } catch(e) { console.error('ACE Rubika polling error:',e.message); }
    finally { polling=false; }
  }
  if (enabled) { console.log('ACE CLUB Rubika bot enabled (polling).'); setTimeout(poll,2500).unref?.(); setInterval(poll,5000).unref?.(); }
  else console.log('ACE CLUB Rubika bot disabled; set RUBIKA_BOT_TOKEN to enable.');
}
module.exports = {installRubikaBot};
