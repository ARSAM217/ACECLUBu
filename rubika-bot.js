'use strict';

// ACE CLUB Rubika integration. Uses the existing ACE CLUB SQLite database.
function installRubikaBot({app, db, cfg, requireAuth, requireAdmin, rateLimit, adminPanelUnlocked, userById, addTx, allChallenges, challengePeriod, challengeMetrics, atomic, syncUserFameAndLevel, notify, logActivity, isAdmin, recordLoginDay, rubikaStartDirect, rubikaSendDirect, rubikaCosmeticList, rubikaBuyCosmetic, rubikaEquipCosmetic, rubikaRandomJoin, rubikaRandomSend, rubikaRandomLeave, rubikaRandomReport, rubikaRandomBlock}) {
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
    ['👤 پروفایل من','📬 پیام‌ها'],
    ['🎲 چت تصادفی','🪙 کیف پول و سکه'],
    ['🛍️ فروشگاه'],
    ['🏆 چالش‌ها و جوایز','🔔 اعلانات'],
    ['🎧 پشتیبانی','🌐 ورود به سایت']
  ];
  const startKeyboard = [['📝 ثبت‌نام','🔐 ورود'],['🔗 ورود به حساب سایت'],['🌐 ورود به سایت']];
  const makeKeypad = rows => ({rows:rows.map((row,i)=>({buttons:row.map((label,j)=>({id:`ace_${i}_${j}`,type:'Simple',button_text:label}))}))});
  const menuKeypad = makeKeypad(menuKeyboard), startKeypad = makeKeypad(startKeyboard);
  const storeKeypad=makeKeypad([['🚀 شتاب‌دهی','👑 اشتراک پرو'],['💬 اشتراک پیام','🎨 پروفایل شخصی'],['↩️ بازگشت']]);
  const cosmeticsKeypad=makeKeypad([['🖼️ قاب‌ها','🌈 رنگ نام'],['🏅 نشان‌ها'],['↩️ بازگشت']]);
  const menuLabels=new Set([...menuKeyboard.flat(),...storeKeypad.rows.flatMap(r=>r),...cosmeticsKeypad.rows.flatMap(r=>r)]);

  const send = (chatId, text, keypad=menuKeypad) => api('sendMessage',{chat_id:String(chatId),text:String(text).slice(0,3500),...(keypad?{chat_keypad:keypad,chat_keypad_type:'New'}:{})});
  const linkForChat = chatId => db.prepare('SELECT l.*,u.username,u.display_name,u.coins,u.level,u.fame,u.xp,u.id AS uid FROM rubika_links l JOIN users u ON u.id=l.user_id WHERE l.chat_id=? AND l.active=1').get(String(chatId));
  const formatUser = u => `👤 ${u.display_name}\nشناسه: ${u.id}\nنام کاربری: @${u.username}\n⭐ سطح: ${u.level}\n🏅 شهرت: ${u.fame}\n🪙 سکه: ${Number(u.coins).toLocaleString('fa-IR')}`;
  const home = `✨ ACE CLUB | ایس کلاب\nدنیای ارتباطات و رقابت\n\nسلام، خوش اومدی! 👋\nاگر حساب ACE CLUB داری، ورود را بزن؛ اگر نداری، ثبت‌نام کن. حساب سایت و ربات یکی است.\n\n🔐 اطلاعات حساب فقط برای ورود به ایس کلاب استفاده می‌شود.\n🌐 https://aceclub.ir`;
  // Credentials are kept only in memory while the user completes the private-chat flow.
  const authFlows = new Map();
  db.exec(`CREATE TABLE IF NOT EXISTS rubika_ticket_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,ticket_id INTEGER,step TEXT DEFAULT '',subject TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rubika_ticket_sent(chat_id TEXT NOT NULL,ticket_message_id INTEGER NOT NULL,PRIMARY KEY(chat_id,ticket_message_id));`);
  try { db.exec("ALTER TABLE rubika_ticket_state ADD COLUMN subject TEXT DEFAULT ''"); } catch(e) { if(!String(e.message).includes('duplicate column')) throw e; }
  db.exec(`CREATE TABLE IF NOT EXISTS rubika_dm_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,conversation_id INTEGER NOT NULL,other_user_id INTEGER NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rubika_dm_sent(chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,PRIMARY KEY(chat_id,message_id));
    CREATE TABLE IF NOT EXISTS rubika_location_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,step TEXT DEFAULT '',consented INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);

  db.exec(`CREATE TABLE IF NOT EXISTS rubika_random_state(chat_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,room_id TEXT DEFAULT '',other_id INTEGER,active INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rubika_random_events(id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id TEXT NOT NULL,room_id TEXT NOT NULL,event_type TEXT NOT NULL,body TEXT DEFAULT '',from_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,sent_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_rubika_random_events_pending ON rubika_random_events(chat_id,sent_at,id);`);
  // Anonymous sessions live in memory like the website's existing random-chat system.
  // On restart, close any persisted bot bridge state cleanly and queue an end notice.
  for(const stale of db.prepare('SELECT chat_id,room_id FROM rubika_random_state WHERE active=1').all()){
    db.prepare('INSERT INTO rubika_random_events(chat_id,room_id,event_type,body) VALUES(?,?,?,?)').run(stale.chat_id,String(stale.room_id||''),'ended','به‌دلیل راه‌اندازی مجدد سرور، گفتگوی تصادفی پایان یافت.');
  }
  db.prepare('UPDATE rubika_random_state SET active=0,updated_at=CURRENT_TIMESTAMP WHERE active=1').run();


  const bcrypt = require('bcryptjs');
  const findUser = username => db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(String(username||''));
  const locationKeypad=()=>({rows:[{buttons:[{id:'ace_location_share',type:'Location',button_text:'📍 ارسال موقعیت من',button_location:{type:'Picker',title:'اشتراک موقعیت برای افراد نزدیک'}}]}]});
  const dmState=chatId=>db.prepare('SELECT * FROM rubika_dm_state WHERE chat_id=?').get(String(chatId));
  const setDmState=(chatId,userId,conversationId,otherId)=>db.prepare('INSERT INTO rubika_dm_state(chat_id,user_id,conversation_id,other_user_id,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,conversation_id=excluded.conversation_id,other_user_id=excluded.other_user_id,updated_at=CURRENT_TIMESTAMP').run(String(chatId),Number(userId),Number(conversationId),Number(otherId));
  const clearDmState=chatId=>db.prepare('DELETE FROM rubika_dm_state WHERE chat_id=?').run(String(chatId));
  const formatDistance=m=>m<1000?`${Math.max(50,Math.round(m/50)*50)} متر`:`${(m/1000).toFixed(m<5000?1:0)} کیلومتر`;
  function nearbyText(userId){const own=db.prepare("SELECT latitude,longitude,updated_at FROM user_locations WHERE user_id=? AND datetime(updated_at)>datetime('now','-30 minutes')").get(userId);if(!own)return 'برای دیدن افراد نزدیک، ابتدا موقعیتت را با اجازه خودت ارسال کن.';const rows=db.prepare("SELECT u.id,u.username,u.display_name,u.level,l.latitude,l.longitude FROM users u JOIN user_locations l ON l.user_id=u.id WHERE u.id<>? AND u.is_banned=0 AND datetime(l.updated_at)>datetime('now','-30 minutes') AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=u.id) OR (b.user_id=u.id AND b.blocked_id=?))").all(userId,userId,userId);const rad=x=>x*Math.PI/180;const list=rows.map(u=>{const a=rad(u.latitude-own.latitude),b=rad(u.longitude-own.longitude),h=Math.sin(a/2)**2+Math.cos(rad(own.latitude))*Math.cos(rad(u.latitude))*Math.sin(b/2)**2,d=6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));return {...u,d};}).filter(x=>x.d<=50000).sort((a,b)=>a.d-b.d).slice(0,10);return '📍 افراد نزدیک (فاصله تقریبی)\n'+(list.map(x=>`• /${x.username} — ${x.display_name} · ${formatDistance(x.d)} · سطح ${x.level}`).join('\n')||'فعلاً کاربر دیگری با موقعیت فعال در محدوده ۵۰ کیلومتری پیدا نشد.')+'\n\nموقعیت دقیق هیچ کاربری نمایش داده نمی‌شود. موقعیت شما تا ۳۰ دقیقه معتبر است؛ برای غیرفعال‌کردن «غیرفعال کردن مکان» را بزن.';}
  async function showDmHistory(chatId,userId,conversationId,otherId){const c=db.prepare('SELECT * FROM conversations WHERE id=?').get(Number(conversationId));if(!c||![Number(c.user_a),Number(c.user_b)].includes(Number(userId))||c.closed_at||db.prepare('SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(userId,otherId,otherId,userId)){clearDmState(chatId);return send(chatId,'گفتگو در دسترس نیست یا به دلیل مسدودسازی بسته شده است.');}const other=userById(otherId);if(!other)return send(chatId,'کاربر در دسترس نیست.');setDmState(chatId,userId,conversationId,otherId);const msgs=db.prepare('SELECT id,sender_id,body,type,created_at FROM messages WHERE conversation_id=? AND deleted=0 ORDER BY id DESC LIMIT 12').all(conversationId).reverse();db.prepare('UPDATE messages SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP),read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND sender_id<>? AND deleted=0').run(conversationId,userId);const lines=msgs.map(m=>`${Number(m.sender_id)===Number(userId)?'🟢 شما':'🔵 '+other.display_name}: ${m.type==='text'?m.body:(m.type==='sticker'?'استیکر':'فایل')} · ${m.created_at}`).join('\n');return send(chatId,`💬 گفتگو با /${other.username}\n\n${lines||'هنوز پیامی وجود ندارد.'}\n\nبرای پاسخ، متن را بفرست یا /reply متن\nبرای خروج از گفتگو /end\nبرای بازکردن دوباره /open ${other.username}`);}
  const cosmeticListText=(kind,label)=>{const items=rubikaCosmeticList?.(kind,12)||[];return `🎨 ${label}\n`+(items.map(i=>`${i.name} · ${i.price} ${i.currency==='coins'?'سکه':'الماس'}\nشناسه: ${i.id}\nخرید: /buy_item ${i.id}`).join('\n\n')||'محصولی موجود نیست.');};
  async function startDmFromBot(chatId,userId,username){const target=findUser(username);if(!target)return send(chatId,'کاربر پیدا نشد.');const result=await rubikaStartDirect?.(userId,target.id);if(!result?.ok)return send(chatId,result?.error||'شروع گفتگو انجام نشد.');if(result.status==='pending')return send(chatId,`درخواست پیام به /${target.username} ارسال شد. اگر حساب خصوصی باشد، طرف مقابل باید درخواست را از سایت بپذیرد.`,menuKeypad);return showDmHistory(chatId,userId,result.conversationId,target.id);}

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
      authFlows.delete(chatId); db.prepare("UPDATE rubika_ticket_state SET step='',ticket_id=COALESCE(ticket_id,0),subject='' WHERE chat_id=?").run(chatId);
      return existing ? send(chatId,`خوش برگشتی 👋\n\n${formatUser(userById(existing.user_id))}`) : send(chatId,home,startKeypad);
    }
    if (/^(لغو|انصراف)$/i.test(text)) { authFlows.delete(chatId); db.prepare("UPDATE rubika_ticket_state SET step='',ticket_id=COALESCE(ticket_id,0),subject='' WHERE chat_id=?").run(chatId); return send(chatId,'عملیات لغو شد. برای ادامه ثبت‌نام یا ورود را انتخاب کن.',startKeypad); }
    if (/^\/help$/i.test(text)) return send(chatId,'راهنمای ACE CLUB\nپروفایل: /username\nپیام: /message username و سپس /reply متن\nگفتگو: /open username · /chats · /end\nچت تصادفی: /random · /random_next · /random_end · /random_report · /random_block\nفروشگاه: /store frames|namecolors|badges · /buy_item شناسه · /equip شناسه\nمکان: افراد نزدیک، سپس ارسال Location\nثبت‌نام و ورود از داخل همین ربات انجام می‌شود.',existing?menuKeypad:startKeypad);
    if (existing && /^(\/logout|قطع اتصال)$/i.test(text)) { rubikaRandomLeave?.(existing.user_id,'قطع اتصال ربات'); db.prepare('DELETE FROM rubika_links WHERE chat_id=?').run(chatId); db.prepare('DELETE FROM rubika_ticket_state WHERE chat_id=?').run(chatId); db.prepare('DELETE FROM rubika_dm_state WHERE chat_id=?').run(chatId); db.prepare('DELETE FROM rubika_location_state WHERE chat_id=?').run(chatId); authFlows.delete(chatId); return send(chatId,'اتصال حساب روبیکا قطع شد. هر زمان خواستی با گزینه ورود دوباره متصل شو.',startKeypad); }

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
    // Persistent support-ticket conversation state; ticket replies are stored in the site's native tables.
    const locationState=db.prepare('SELECT * FROM rubika_location_state WHERE chat_id=? AND user_id=?').get(chatId,existing.user_id);
    if(msg.location&&locationState?.step==='await_location'){
      const latitude=Number(msg.location.latitude),longitude=Number(msg.location.longitude);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude > 90||longitude < -180||longitude > 180)return send(chatId,'موقعیت ارسال‌شده معتبر نیست؛ دوباره تلاش کن.',locationKeypad());
      db.prepare("INSERT INTO user_locations(user_id,latitude,longitude,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,updated_at=CURRENT_TIMESTAMP").run(existing.user_id,latitude,longitude);
      db.prepare("INSERT INTO rubika_location_state(chat_id,user_id,step,consented,updated_at) VALUES(?,?, '',1,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,step='',consented=1,updated_at=CURRENT_TIMESTAMP").run(chatId,existing.user_id);
      return send(chatId,nearbyText(existing.user_id),menuKeypad);
    }
    const ticketState=db.prepare('SELECT * FROM rubika_ticket_state WHERE chat_id=? AND user_id=?').get(chatId,existing.user_id);
    if(ticketState && ticketState.step==='subject'){
      const subject=text.slice(0,120).trim(); if(subject.length<2)return send(chatId,'عنوان درخواست کوتاه است؛ عنوان را دوباره بفرست یا «لغو» را بزن.',null);
      db.prepare("UPDATE rubika_ticket_state SET ticket_id=0,step='body',subject=?,updated_at=CURRENT_TIMESTAMP WHERE chat_id=?").run(subject,chatId); authFlows.set(chatId,{mode:'support',step:'body',subject}); return send(chatId,'متن کامل درخواستت را ارسال کن (حداکثر ۳۰۰۰ نویسه):',null);
    }
    const supportFlow=authFlows.get(chatId);
    if((supportFlow?.mode==='support'&&supportFlow.step==='body')||(ticketState?.step==='body')){
      const body=text.trim().slice(0,3000); if(body.length<2)return send(chatId,'متن درخواست کوتاه است؛ دوباره بنویس یا «لغو» را بزن.',null);
      const ticketSubject=String(supportFlow?.subject||ticketState?.subject||'پشتیبانی روبیکا').slice(0,120); const result=db.prepare('INSERT INTO tickets(user_id,subject) VALUES(?,?)').run(existing.user_id,ticketSubject); const ticketId=Number(result.lastInsertRowid);
      db.prepare('INSERT INTO ticket_messages(ticket_id,sender_id,body) VALUES(?,?,?)').run(ticketId,existing.user_id,body);
      for(const staff of db.prepare("SELECT id FROM users WHERE role IN ('owner','creator','admin','support','moderator')").all())notify(staff.id,'تیکت جدید',`تیکت #${ticketId}: ${ticketSubject}`,{action:'ticket',requestId:ticketId,fromId:existing.user_id});
      db.prepare('INSERT INTO rubika_ticket_state(chat_id,user_id,ticket_id,step,subject) VALUES(?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,ticket_id=excluded.ticket_id,step=excluded.step,subject=excluded.subject,updated_at=CURRENT_TIMESTAMP').run(chatId,existing.user_id,ticketId,'',''); authFlows.delete(chatId);
      return send(chatId,`✅ تیکت در سامانه اصلی ثبت شد.
شماره تیکت: #${ticketId}
برای مشاهده تاریخچه، بنویس «تیکت‌ها». پاسخ پشتیبانی از همین ربات ارسال می‌شود.`);
    }
    if(text==='🎧 پشتیبانی'){authFlows.set(chatId,{mode:'support',step:'subject'});db.prepare('INSERT INTO rubika_ticket_state(chat_id,user_id,ticket_id,step) VALUES(?,?,NULL,?) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,ticket_id=NULL,step=excluded.step,updated_at=CURRENT_TIMESTAMP').run(chatId,existing.user_id,'subject');return send(chatId,'🎧 پشتیبانی ACE CLUB\nعنوان درخواستت را بنویس:',null);}
    if(text==='تیکت‌ها'||text==='/tickets') {const tickets=db.prepare('SELECT id,subject,status,created_at FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 10').all(existing.user_id);const parts=tickets.map(t=>{const replies=db.prepare('SELECT body,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id DESC LIMIT 3').all(t.id).reverse();return `#${t.id} · ${t.status==='closed'?'بسته':t.status==='pending'?'در انتظار':'باز'}\n${t.subject} · ${t.created_at}\n${replies.map(r=>`↳ ${r.created_at}: ${String(r.body).slice(0,350)}`).join('\n')}`;});return send(chatId,'🎧 تاریخچه تیکت‌ها\n'+(parts.join('\n\n')||'تیکتی ثبت نشده است.'));}
    db.prepare('UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?').run(existing.user_id);
    const user = userById(existing.user_id);
    if (!user || user.is_banned) return send(chatId,'دسترسی این حساب در ACE CLUB فعال نیست.');
    if (text==='👤 پروفایل من') return send(chatId,formatUser(user)+`\n\nبرای پروفایل کاربران، نام کاربری مثل /arsam را ارسال کن.`);
    const profileQuery=text.match(/^\/?([a-zA-Z0-9_]{3,24})$/);
    if(profileQuery){const target=findUser(profileQuery[1]);if(!target||target.is_banned)return send(chatId,'کاربر پیدا نشد یا پروفایل در دسترس نیست.');const blocked=db.prepare('SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(user.id,target.id,target.id,user.id);if(blocked)return send(chatId,'این پروفایل به‌دلیل مسدودسازی در دسترس نیست.');const publicProfile=target.account_privacy==='public';const pro=!!(user.pro_until&&Date.parse(user.pro_until)>Date.now());const likeCount=db.prepare('SELECT COUNT(*) n FROM likes WHERE to_id=?').get(target.id).n;const liked=!!db.prepare('SELECT 1 FROM likes WHERE from_id=? AND to_id=?').get(user.id,target.id);const targetPro=!!(target.pro_until&&Date.parse(target.pro_until)>Date.now()),visibleAge=publicProfile&&pro&&target.age?`\n🎂 سن: ${target.age}`:'',avatarUrl=target.avatar?(/^https?:\/\//i.test(String(target.avatar))?String(target.avatar):`https://aceclub.ir${target.avatar.startsWith('/')?'':'/'}${target.avatar}`):'',avatarLink=publicProfile&&avatarUrl?`\n🖼️ عکس پروفایل: ${avatarUrl}`:'';const textProfile=`👤 /${target.username}\n${target.display_name}\n⭐ سطح ${target.level} · 🏅 شهرت ${target.fame}\n${publicProfile?'🔓 حساب عمومی':'🔒 حساب خصوصی'} · ${likeCount} لایک${targetPro?' · 👑 پرو':''}${visibleAge}${avatarLink}\n${publicProfile?(target.bio||'بدون بیو'):'اطلاعات بیشتر برای حساب خصوصی نمایش داده نمی‌شود.'}`;return send(chatId,textProfile+`\n\nبرای لایک: /like ${target.username}\nبرای پیام: /message ${target.username}`,menuKeypad);}
    if(/^\/like\s+/i.test(text)){const uname=text.replace(/^\/like\s+/i,'').replace(/^\//,'');const target=findUser(uname);if(!target||target.id===user.id)return send(chatId,'کاربر معتبر نیست.');if(db.prepare('SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(user.id,target.id,target.id,user.id))return send(chatId,'به‌دلیل مسدودسازی امکان لایک نیست.');if(db.prepare('SELECT 1 FROM likes WHERE from_id=? AND to_id=?').get(user.id,target.id))return send(chatId,'این کاربر را قبلاً لایک کرده‌ای.');db.prepare('INSERT INTO likes(from_id,to_id) VALUES(?,?)').run(user.id,target.id);notify(target.id,'لایک جدید',user.display_name+' پروفایل شما را لایک کرد');return send(chatId,`❤️ /${target.username} لایک شد.`);}
    if(/^\/message\s+/i.test(text))return startDmFromBot(chatId,user.id,text.replace(/^\/message\s+/i,'').replace(/^\//,'').trim());
    if(/^\/open\s+/i.test(text))return startDmFromBot(chatId,user.id,text.replace(/^\/open\s+/i,'').replace(/^\//,'').trim());
    if(text==='/chats'||text==='📬 پیام‌ها'){const rows=db.prepare('SELECT c.id,c.user_a,c.user_b,MAX(m.id) last_id,MAX(m.created_at) last_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE (c.user_a=? AND c.hidden_a=0) OR (c.user_b=? AND c.hidden_b=0) GROUP BY c.id ORDER BY last_id DESC LIMIT 10').all(user.id,user.id);return send(chatId,'📬 گفت‌وگوهای اخیر\n'+(rows.map(c=>{const oid=c.user_a===user.id?c.user_b:c.user_a,o=userById(oid);return o?`• /${o.username} — ${c.last_at||'بدون پیام'}\nبرای بازکردن: /open ${o.username}`:''}).filter(Boolean).join('\n')||'گفت‌وگویی نداری.'));}
    if(/^\/reply\s+/i.test(text)){const st=dmState(chatId);if(!st)return send(chatId,'ابتدا یک گفت‌وگو را با /open username باز کن.');const body=text.replace(/^\/reply\s+/i,'').trim();const result=await rubikaSendDirect?.(user.id,st.conversation_id,body);if(!result?.ok)return send(chatId,result?.error||'پیام ارسال نشد.');return send(chatId,'✅ پیام در گفت‌وگوی اصلی ACE CLUB ارسال شد.');}
    if(text==='/end'){clearDmState(chatId);return send(chatId,'گفت‌وگوی انتخاب‌شده بسته شد. برای بازکردن دوباره /open username را بفرست.');}
    const currentDm=dmState(chatId);if(currentDm&&!text.startsWith('/')&&!menuLabels.has(text)){const result=await rubikaSendDirect?.(user.id,currentDm.conversation_id,text);if(!result?.ok)return send(chatId,result?.error||'پیام ارسال نشد.');return send(chatId,'✅ پیام ارسال شد.');}
    if(text==='🎲 چت تصادفی'||text==='/random'||text==='/random_advanced'){const mode=text==='/random_advanced'?'advanced':'random',result=rubikaRandomJoin?.(user.id,chatId,{mode});if(!result?.ok)return send(chatId,result?.error||'ورود به صف انجام نشد.');return send(chatId,result.status==='matched'?'🎲 هم‌صحبت پیدا شد؛ پیام‌ها ناشناس هستند. برای پایان /random_end، گزارش /random_report و مسدودسازی /random_block':'🎲 وارد صف چت تصادفی شدی. در انتظار هم‌صحبت… برای لغو /random_end');}
    if(text==='/random_next'){rubikaRandomLeave?.(user.id,'جست‌وجوی مجدد');const result=rubikaRandomJoin?.(user.id,chatId,{mode:'random'});return send(chatId,result?.ok?`🔄 ${result.status==='matched'?'هم‌صحبت جدید پیدا شد.':'دوباره وارد صف شدی؛ در انتظار…'}`:result?.error||'جست‌وجو انجام نشد.');}
    if(text==='/random_end'){const result=rubikaRandomLeave?.(user.id,'کاربر گفتگو را پایان داد');return send(chatId,result?.active?'گفتگوی تصادفی پایان یافت.':'از صف جست‌وجو خارج شدی.');}
    if(/^\/random_report(?:\s+|$)/i.test(text)){const result=rubikaRandomReport?.(user.id,text.replace(/^\/random_report\s*/i,'')||'گزارش از چت تصادفی');return send(chatId,result?.ok?'گزارش ثبت شد. برای پایان /random_end یا ادامه گفتگو پیام بده.':result?.error||'گزارش ثبت نشد.');}
    if(text==='/random_block'){const result=rubikaRandomBlock?.(user.id);return send(chatId,result?.ok?'کاربر مقابل مسدود شد و گفتگو پایان یافت.':result?.error||'مسدودسازی انجام نشد.');}
    const randomState=db.prepare('SELECT * FROM rubika_random_state WHERE chat_id=? AND user_id=? AND active=1').get(chatId,user.id);if(randomState&&!text.startsWith('/')&&!menuLabels.has(text)){const result=rubikaRandomSend?.(user.id,text);return send(chatId,result?.ok?'پیام ناشناس ارسال شد.':result?.error||'ارسال پیام ناموفق بود.');}
    if(/^\/buy_item\s+/i.test(text)){const itemId=text.replace(/^\/buy_item\s+/i,'').trim(),result=rubikaBuyCosmetic?.(user.id,itemId);return send(chatId,result?.ok?`✅ ${result.item.name} خریداری شد.\nبرای استفاده: /equip ${result.item.id}`:result?.error||'خرید ناموفق بود.');}
    if(/^\/equip\s+/i.test(text)){const itemId=text.replace(/^\/equip\s+/i,'').trim(),result=rubikaEquipCosmetic?.(user.id,itemId);return send(chatId,result?.ok?`✅ ${result.item.name} روی پروفایل فعال شد.`:result?.error||'فعال‌سازی انجام نشد.');}
    if(/^\/store\s+(frames|namecolors|badges)$/i.test(text)){const kind=text.match(/^\/store\s+(frames|namecolors|badges)$/i)[1],type={frames:'frame',namecolors:'namecolor',badges:'badge'}[kind],items=rubikaCosmeticList?.(type,12)||[];return send(chatId,'🎨 محصولات '+({frames:'قاب پروفایل',namecolors:'رنگ نام کاربری',badges:'نشان‌ها'}[kind])+'\n'+items.map(i=>`${i.name} · ${i.price} ${i.currency==='coins'?'سکه':'الماس'}\nشناسه: ${i.id}\nخرید: /buy_item ${i.id}`).join('\n\n')||'محصولی موجود نیست.');}

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
      const rows=db.prepare("SELECT id,display_name,username,level,fame,bio FROM users WHERE id<>? AND is_banned=0 AND account_privacy='public' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=users.id) OR (b.user_id=users.id AND b.blocked_id=?)) ORDER BY last_seen DESC LIMIT 8").all(user.id,user.id,user.id);
      return send(chatId,'🔎 کاربران عمومی پیشنهادی\n'+(rows.map(x=>`• /${x.username} — ${x.display_name} · سطح ${x.level} · شهرت ${x.fame}`).join('\n')||'کاربری برای نمایش پیدا نشد.')+'\n\nبرای بازکردن پروفایل، نام کاربری را ارسال کن؛ برای لایک /like username');
    }
    if(text==='📍 افراد نزدیک'){const prior=db.prepare("SELECT updated_at FROM user_locations WHERE user_id=? AND datetime(updated_at)>datetime('now','-30 minutes')").get(user.id);db.prepare('INSERT INTO rubika_location_state(chat_id,user_id,step,consented,updated_at) VALUES(?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id,step=excluded.step,updated_at=CURRENT_TIMESTAMP').run(chatId,user.id,'await_location');return send(chatId,`📍 افراد نزدیک\nبرای این قابلیت، فقط پس از اجازه خودت موقعیتت دریافت می‌شود. موقعیت دقیق برای دیگران نمایش داده نمی‌شود و داده موقعیت بعد از ۳۰ دقیقه منقضی محسوب می‌شود.\n${prior?'موقعیت قبلی هنوز تازه است؛ می‌توانی دوباره به‌روزرسانی کنی.':''}\nبرای توقف نمایش موقعیت، هر زمان «غیرفعال کردن مکان» را بفرست.`,locationKeypad());}
    if(text==='غیرفعال کردن مکان'||text==='/location_off'){db.prepare('DELETE FROM user_locations WHERE user_id=?').run(user.id);db.prepare("UPDATE rubika_location_state SET step='',consented=0,updated_at=CURRENT_TIMESTAMP WHERE chat_id=?").run(chatId);return send(chatId,'✅ موقعیت مکانی از ACE CLUB حذف شد و نمایش افراد نزدیک برای حساب تو غیرفعال شد.');}
    if(text==='🔎 نمایش افراد نزدیک'||text==='/nearby'){return send(chatId,nearbyText(user.id));}

    if (text==='📲 نصب اپلیکیشن') return send(chatId,'📲 دریافت اپلیکیشن ACE CLUB\nhttps://aceclub.ir/install');
    if(text==='🛍️ فروشگاه'){return send(chatId,'🛍️ فروشگاه ACE CLUB\nچهار بخش فروشگاه را انتخاب کن. خریدها از کیف پول اصلی ACE CLUB انجام و در تراکنش‌ها ثبت می‌شوند.',storeKeypad);}
    if(text==='↩️ بازگشت')return send(chatId,'منوی اصلی ACE CLUB',menuKeypad);
    if(text==='🎨 پروفایل شخصی')return send(chatId,'🎨 فروشگاه پروفایل شخصی\nقاب‌ها با سکه و رنگ نام/نشان با الماس خریداری می‌شوند. برای دیدن محصولات انتخاب کن.',cosmeticsKeypad);
    if(text==='🖼️ قاب‌ها')return send(chatId,cosmeticListText('frame','قاب پروفایل'),cosmeticsKeypad);
    if(text==='🌈 رنگ نام')return send(chatId,cosmeticListText('namecolor','رنگ نام کاربری'),cosmeticsKeypad);
    if(text==='🏅 نشان‌ها')return send(chatId,cosmeticListText('badge','نشان‌ها'),cosmeticsKeypad);
    if(text==='🚀 شتاب‌دهی'||text==='👑 اشتراک پرو'||text==='💬 اشتراک پیام'){const kind=text==='🚀 شتاب‌دهی'?'boost':text==='👑 اشتراک پرو'?'pro':'message_pass',base=kind==='boost'?Number(db.prepare("SELECT value FROM settings WHERE key='boost_cost'").get()?.value||250):kind==='pro'?Number(db.prepare("SELECT value FROM settings WHERE key='pro_cost'").get()?.value||750):200,days=kind==='boost'?1:kind==='pro'?30:7;if(kind==='boost'&&db.prepare("SELECT value FROM settings WHERE key='boost_enabled'").get()?.value==='0')return send(chatId,'شتاب‌دهی فعلاً غیرفعال است.');return send(chatId,`${text}\nقیمت: ${Math.max(1,base)} سکه · ${days} روز\nخرید: /buy ${kind}_${days}`);}
    
    const buyMatch=text.match(/^\/buy\s+(pro|boost|message_pass)_(1|3|7|30)$/i);
    if(buyMatch){const kind=buyMatch[1],days=Number(buyMatch[2]),unit={pro:30,boost:1,message_pass:7}[kind],base={pro:Number(db.prepare("SELECT value FROM settings WHERE key='pro_cost'").get()?.value||750),boost:Number(db.prepare("SELECT value FROM settings WHERE key='boost_cost'").get()?.value||250),message_pass:200}[kind],cost=Math.max(1,Math.ceil(base*days/unit)),column={pro:'pro_until',boost:'boost_until',message_pass:'message_pass_until'}[kind],fresh=userById(user.id);if(kind==='boost'&&db.prepare("SELECT value FROM settings WHERE key='boost_enabled'").get()?.value==='0')return send(chatId,'شتاب‌دهی فعلاً غیرفعال است.');if(fresh[column]&&Date.parse(fresh[column])>Date.now())return send(chatId,'این اشتراک هنوز فعال است و خرید دوباره انجام نشد.');if(Number(fresh.coins)<cost)return send(chatId,`سکه کافی نداری. قیمت: ${cost} سکه.`);try{atomic(()=>{const upd=db.prepare('UPDATE users SET coins=coins-? WHERE id=? AND coins>=?').run(cost,user.id,cost);if(!upd.changes)throw new Error('سکه کافی نیست');db.prepare(`UPDATE users SET ${column}=? WHERE id=?`).run(new Date(Date.now()+days*86400000).toISOString(),user.id);db.prepare('INSERT INTO transactions(user_id,amount,kind,note) VALUES(?,?,?,?)').run(user.id,-cost,'purchase',`${kind} · ${days} روز · ربات روبیکا`);});notify(user.id,'خرید موفق',`اشتراک ${kind} به مدت ${days} روز فعال شد`);return send(chatId,`✅ خرید با موفقیت انجام شد.\n${kind} · ${days} روز\n🪙 ${cost} سکه از کیف پول اصلی کسر شد.`);}catch(e){return send(chatId,'خرید انجام نشد: '+String(e.message||'خطا'));}}

    if (text==='🌐 ورود به سایت') return send(chatId,'https://aceclub.ir');

    return send(chatId,'از منوی پایین یکی از امکانات ACE CLUB را انتخاب کن.');
  }

  // The user connects an existing website account by logging in inside the private bot chat.
  // No temporary code, second account, or separate database is used.
  app.get('/api/rubika/status',requireAuth,(req,res)=>{
    const row=db.prepare('SELECT chat_id,linked_at FROM rubika_links WHERE user_id=? AND active=1').get(req.user.id);
    res.json({linked:!!row,linkedAt:row?.linked_at||null,enabled,botUsername:BOT_USERNAME});
  });
  app.delete('/api/rubika/link',requireAuth,(req,res)=>{
    const linked=db.prepare('SELECT chat_id FROM rubika_links WHERE user_id=? AND active=1').get(req.user.id);
    if(linked){rubikaRandomLeave?.(req.user.id,'قطع اتصال ربات از تنظیمات سایت');db.prepare('DELETE FROM rubika_ticket_state WHERE chat_id=?').run(linked.chat_id);db.prepare('DELETE FROM rubika_dm_state WHERE chat_id=?').run(linked.chat_id);db.prepare('DELETE FROM rubika_location_state WHERE chat_id=?').run(linked.chat_id);}
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
  async function pollTicketReplies(){if(!enabled)return;db.prepare("DELETE FROM rubika_ticket_sent WHERE ticket_message_id IN (SELECT id FROM ticket_messages WHERE created_at<datetime('now','-90 days'))").run();for(const link of db.prepare('SELECT chat_id,user_id FROM rubika_links WHERE active=1').all()){try{const replies=db.prepare('SELECT tm.id,tm.ticket_id,tm.body,tm.created_at,tm.sender_id,u.username FROM ticket_messages tm JOIN tickets t ON t.id=tm.ticket_id JOIN users u ON u.id=tm.sender_id WHERE t.user_id=? AND tm.sender_id<>? ORDER BY tm.id LIMIT 20').all(link.user_id,link.user_id);for(const r of replies){if(db.prepare('SELECT 1 FROM rubika_ticket_sent WHERE chat_id=? AND ticket_message_id=?').get(link.chat_id,r.id))continue;await send(link.chat_id,`💬 پاسخ تیکت #${r.ticket_id}\n${r.body}\n${r.created_at}`);db.prepare('INSERT OR IGNORE INTO rubika_ticket_sent(chat_id,ticket_message_id) VALUES(?,?)').run(link.chat_id,r.id);} }catch(e){console.error('Rubika ticket reply poll failed:',e.message);}}}
  async function pollRandomEvents(){if(!enabled)return;db.prepare("DELETE FROM rubika_random_events WHERE created_at<datetime('now','-30 days')").run();for(const state of db.prepare('SELECT chat_id,user_id,room_id,active FROM rubika_random_state').all()){try{const events=db.prepare('SELECT * FROM rubika_random_events WHERE chat_id=? AND sent_at IS NULL ORDER BY id LIMIT 10').all(state.chat_id);for(const ev of events){if(ev.event_type==='matched'){await send(ev.chat_id,'🎲 هم‌صحبت پیدا شد! گفتگو ناشناس است.\nپیام بفرست تا طرف مقابل دریافت کند.\nپایان: /random_end · جست‌وجوی مجدد: /random_next · گزارش: /random_report · مسدود: /random_block');}else if(ev.event_type==='message'){await send(ev.chat_id,`💬 ناشناس: ${String(ev.body||'').slice(0,1800)}`);}else if(ev.event_type==='ended'){await send(ev.chat_id,`گفتگوی ناشناس پایان یافت.\n${ev.body||''}\nبرای جست‌وجوی دوباره /random_next`);db.prepare('UPDATE rubika_random_state SET active=0,updated_at=CURRENT_TIMESTAMP WHERE chat_id=?').run(ev.chat_id);}db.prepare('UPDATE rubika_random_events SET sent_at=CURRENT_TIMESTAMP WHERE id=?').run(ev.id);}}catch(e){console.error('Rubika random-chat event poll failed:',e.message);}}}
  async function pollDirectMessages(){if(!enabled)return;db.prepare("DELETE FROM rubika_dm_sent WHERE message_id IN (SELECT id FROM messages WHERE created_at<datetime('now','-90 days'))").run();for(const link of db.prepare('SELECT chat_id,user_id FROM rubika_links WHERE active=1').all()){try{const userId=Number(link.user_id);const rows=db.prepare(`SELECT m.id,m.conversation_id,m.sender_id,m.body,m.type,m.created_at,u.username,u.display_name FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN users u ON u.id=m.sender_id WHERE m.sender_id<>? AND m.deleted=0 AND m.read_at IS NULL AND c.closed_at IS NULL AND ((c.user_a=? AND c.hidden_a=0) OR (c.user_b=? AND c.hidden_b=0)) ORDER BY m.id ASC LIMIT 10`).all(userId,userId,userId);for(const m of rows){if(db.prepare('SELECT 1 FROM rubika_dm_sent WHERE chat_id=? AND message_id=?').get(link.chat_id,m.id))continue;const preview=m.type==='text'?String(m.body||'').slice(0,900):'یک فایل/رسانه ارسال شده است (مشاهده از سایت)';await send(link.chat_id,`📩 پیام جدید از /${m.username} · ${m.display_name}\n${preview}\n\nبرای بازکردن گفتگو: /open ${m.username}`);db.prepare('INSERT OR IGNORE INTO rubika_dm_sent(chat_id,message_id) VALUES(?,?)').run(link.chat_id,m.id);db.prepare('UPDATE messages SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP),read_at=CURRENT_TIMESTAMP WHERE id=?').run(m.id);}}catch(e){console.error('Rubika DM polling failed:',e.message);}}}
  async function poll() {
    if (!enabled || polling) return;
    polling=true;
    try {
      const data=await api('getUpdates',{limit:20,...(offsetId?{offset_id:offsetId}:{})});
      for (const update of (data.updates||[])) { try { await handleMessage(update); } catch(e) { console.error('ACE Rubika update failed:',e.message); } }
      if (data.next_offset_id) { offsetId=String(data.next_offset_id); db.prepare("INSERT INTO settings(key,value) VALUES('rubika_offset_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(offsetId); }
    } catch(e) { console.error('ACE Rubika polling error:',e.message); }
    finally { polling=false; }
    try{await pollTicketReplies();await pollDirectMessages();await pollRandomEvents();}catch{}
  }
  if (enabled) { console.log('ACE CLUB Rubika bot enabled (polling).'); setTimeout(poll,2500).unref?.(); setInterval(poll,5000).unref?.(); }
  else console.log('ACE CLUB Rubika bot disabled; set RUBIKA_BOT_TOKEN to enable.');
}
module.exports = {installRubikaBot};
