from pathlib import Path
import re, shutil

ROOT = Path.cwd()

def read(rel):
    p = ROOT / rel
    if not p.is_file():
        raise SystemExit(f'فایل پیدا نشد: {rel}')
    return p.read_text(encoding='utf-8')

def write(rel, s):
    (ROOT / rel).write_text(s, encoding='utf-8')

def once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(
            f'توقف امن: بخش «{label}» باید دقیقاً یک‌بار باشد؛ تعداد: {n}'
        )
    return s.replace(old, new, 1)

files = [
    'server.js',
    'public/app.js',
    'public/classic-game.js',
    'public/index.html',
    'public/style.css',
    'package.json',
    'scripts/release-smoke-check.js'
]

for rel in files:
    p = ROOT / rel
    if not p.is_file():
        raise SystemExit(f'فایل لازم موجود نیست: {rel}')
    bak = p.with_name(p.name + '.before-remove-hokm')
    if not bak.exists():
        shutil.copy2(p, bak)

# حذف موتور و APIهای حکم پاستور از سرور
s = read('server.js')

start = '// HOKM PASTOR: authoritative four-player online rooms. No bots are advertised or inserted.'
end = "app.post('/api/games/join',requireAuth,requireGameAccess,(req,res)=>{"

if s.count(start) != 1 or s.count(end) != 1 or s.index(start) >= s.index(end):
    raise SystemExit('توقف امن: مرزهای بخش اصلی Hokm در server.js دقیق نیست.')

s = s[:s.index(start)] + s[s.index(end):]

patterns = [
    (r"^\s*for\(const r of db\.prepare\(\"SELECT id,status,created_at,updated_at,state_json FROM hokm_rooms WHERE status IN \('waiting','playing'\).*?\}\n", 'ردیف بازی فعال Hokm'),
    (r"^\s*for\(const r of db\.prepare\(\"SELECT id,status,created_at,updated_at,state_json FROM hokm_rooms ORDER BY id DESC LIMIT 300\"\).*?\}\n", 'ردیف تاریخچه Hokm'),
    (r"^\s*for\(const r of db\.prepare\(\"SELECT id,status,created_at,state_json FROM hokm_rooms WHERE status IN \('waiting','playing'\).*?\}\n", 'ردیف فهرست بازی‌های زنده Hokm'),
    (r"^\s*if\(kind==='hokm'\)\{const room=hokmRead\(id\).*?\}\n", 'شاخه بستن بازی Hokm'),
    (r"^\s*if\(kind==='hokm'\)\{const room=hokmRead\(id\).*?\}\n", 'شاخه جزئیات زنده Hokm'),
]

for pat, label in patterns:
    s2, n = re.subn(pat, '', s, count=1, flags=re.M | re.S)
    if n != 1:
        raise SystemExit(f'توقف امن: {label} پیدا نشد یا چند بار وجود دارد: {n}')
    s = s2

write('server.js', s)

# حذف مسیرها و نمایش‌های مدیریتی از app.js
a = read('public/app.js')

a = once(a, "'hokm-pastor':'hokm-pastor','hokm':'hokm-pastor'", '', 'میانبر هش Hokm')
a = once(a, ",'hokm-pastor':()=>window.hokmPastorScreen?.()", '', 'اجرای صفحه Hokm')

a = once(
    a,
    "  if(kind==='hokm')details=`<div class=\"statsgrid\"><div class=\"stat\">وضعیت<strong>${esc(g.status||'—')}</strong></div><div class=\"stat\">خال حکم<strong>${esc(({S:'♠ پیک',H:'♥ دل',D:'♦ خشت',C:'♣ گشنیز'})[g.trump]||'انتخاب نشده')}</strong></div><div class=\"stat\">امتیاز<strong>${fa(g.roundScore?.[0]||0)} - ${fa(g.roundScore?.[1]||0)}</strong></div></div><p class=\"muted\">مرحله: ${esc(g.stage||'—')} · نوبت صندلی: ${g.turnSeat==null?'—':Number(g.turnSeat)+1}</p>`;\n  else details=",
    "  details=",
    'نمایش جزئیات مدیریتی Hokm'
)

a = once(
    a,
    "${kind==='hokm'?'حکم پاستور':'اسم‌وفامیل'} · بازی #${Number(g.id)}",
    "اسم‌وفامیل · بازی #${Number(g.id)}",
    'عنوان جزئیات مدیریتی'
)

a = once(
    a,
    'سوابق بازی‌های حکم پاستور و اسم‌وفامیل',
    'سوابق بازی‌های اسم‌وفامیل',
    'عنوان تاریخچه اضافی'
)

a = once(
    a,
    "${g.kind==='hokm'?'حکم پاستور':'اسم‌وفامیل'} · بازی #${g.id}",
    "اسم‌وفامیل · بازی #${g.id}",
    'عنوان جزئیات تاریخچه'
)

write('public/app.js', a)

# حذف کارت و مسیرهای بازی از مرکز بازی‌ها
c = read('public/classic-game.js')

c = once(
    c,
    "        ${gameHubCard('hokm-pastor','حکم پاستور','حکم چهار نفره آنلاین · دو تیم دونفره · اتاق خصوصی','ورود به بازی','ace-hub-hokm')}\n",
    '',
    'کارت Hokm مرکز بازی'
)

c = once(
    c,
    "if(btn.dataset.hubOpen==='hokm-pastor')return window.hokmPastorScreen?.()",
    '',
    'مسیریابی کارت Hokm'
)

c = once(
    c,
    "if(kind==='hokm')return window.hokmOpenRoom?.(id);",
    '',
    'ورود به بازی فعال Hokm'
)

c = once(
    c,
    '<option value="hokm">حکم پاستور</option>',
    '',
    'فیلتر زنده Hokm'
)

c = once(
    c,
    "      if(kind==='hokm'){body=`<div class=\"statsgrid\"><div class=\"stat\">حکم<strong>${esc(({S:'♠ پیک',H:'♥ دل',D:'♦ خشت',C:'♣ گشنیز'})[g.trump]||'—')}</strong></div><div class=\"stat\">امتیاز تیم‌ها<strong>${fa(g.roundScore?.[0]||0)} - ${fa(g.roundScore?.[1]||0)}</strong></div><div class=\"stat\">مرحله<strong>${esc(g.stage||'—')}</strong></div></div>`;}\n      else if(kind==='namefamile')",
    "      if(kind==='namefamile')",
    'نمایش تماشاگر Hokm'
)

old = "kind==='hokm'?'حکم پاستور':"
if c.count(old) != 2:
    raise SystemExit(f'توقف امن: عبارت عنوان Hokm باید دو بار باشد؛ تعداد: {c.count(old)}')

c = c.replace(old, "")
write('public/classic-game.js', c)

# حذف بارگذاری فایل بازی
h = read('public/index.html')
h = once(
    h,
    '<script src="/hokm-pastor-game.js"></script>',
    '',
    'بارگذاری اسکریپت Hokm'
)
write('public/index.html', h)

# حذف CSS اختصاصی حکم پاستور
css = read('public/style.css')
marker = '/* ACE CLUB — حکم پاستور */'

if css.count(marker) != 1:
    raise SystemExit('توقف امن: شروع CSS حکم پاستور دقیقاً یک‌بار پیدا نشد.')

css = css[:css.index(marker)].rstrip() + '\n'
write('public/style.css', css)

# اصلاح فرمان‌های تست
pkg = read('package.json')
pkg = once(
    pkg,
    ' && node --check public/hokm-pastor-game.js && node --check lib/hokm-engine.js && node scripts/hokm-engine-test.js',
    '',
    'فرمان تست Hokm'
)
write('package.json', pkg)

# اصلاح تست قدیمی Connect بدون حذف فایل Connect
t = read('scripts/release-smoke-check.js')

t = once(
    t,
    "const css = fs.readFileSync('public/style.css', 'utf8');",
    "const css = fs.readFileSync('public/style.css', 'utf8');\nconst html = fs.readFileSync('public/index.html', 'utf8');",
    'خواندن HTML برای تست'
)

t = once(
    t,
    "['Connect-exclusive endpoints and client file are removed', !/\\/api\\/connect\\//.test(server) && !fs.existsSync('public/connect-game.js')]",
    "['Connect-exclusive endpoints remain absent and legacy client is not loaded', !/\\/api\\/connect\\//.test(server) && !/connect-game\\.js/.test(html)]",
    'اصلاح تست Connect'
)

t2, n = re.subn(
    r"^\s*\['Hokm Pastor[^\n]*\n(?:\s*\['Hokm Pastor[^\n]*\n)*",
    '',
    t,
    flags=re.M
)

if n != 1:
    raise SystemExit(f'توقف امن: بلوک تست‌های Hokm پیدا نشد: {n}')

write('scripts/release-smoke-check.js', t2)

# حذف فقط فایل‌های اختصاصی حکم پاستور
for rel in [
    'public/hokm-pastor-game.js',
    'lib/hokm-engine.js',
    'scripts/hokm-engine-test.js'
]:
    p = ROOT / rel
    if p.exists():
        p.unlink()

print('حذف حکم پاستور از کد، رابط کاربری، API و مدیریت انجام شد.')
print('جدول و اطلاعات قبلی hokm_rooms عمداً دست‌نخورده باقی ماند.')
print('از فایل‌های اصلی نسخه پشتیبان ساخته شد.')
