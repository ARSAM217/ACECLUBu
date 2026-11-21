# راهنمای نصب و انتشار ACEONE (فارسی)

## پیش‌نیاز
- Node.js نسخه 24.x مطابق `package.json`.
- یک فضای پایدار برای دیتابیس، فایل‌های uploads و sessions.
- برای ربات: token روبیکا و username ربات.

## نصب
```bash
unzip ACEONE_FINAL_RELEASE.zip
cd ACEONE
cp .env.example .env
```
در `.env` یک `SESSION_SECRET` طولانی و یکتا وارد کنید (حداقل ۳۲ کاراکتر). توکن ربات را فقط روی سرور و در `.env`/environment variables تنظیم کنید؛ آن را در Git یا ZIP قرار ندهید.

```bash
npm ci
npm run check
npm start
```

## متغیرهای محیطی
- `PORT`: پورت HTTP (پیش‌فرض 1074).
- `SESSION_SECRET`: راز session؛ برای production الزامی و طولانی/تصادفی.
- `DATABASE_PATH`: مسیر دیتابیس SQLite روی دیسک پایدار.
- `UPLOADS_DIR`: مسیر فایل‌های آپلودی روی دیسک پایدار.
- `RUBIKA_BOT_TOKEN`: توکن محرمانه ربات.
- `RUBIKA_BOT_USERNAME`: username ربات بدون @.
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`: فقط اگر provider TURN در اختیار دارید.

## Runflare/میزبانی
1. فایل‌های سورس پاک‌سازی‌شده را deploy کنید.
2. Node 24.x و command نصب `npm ci` را تنظیم کنید.
3. environment variables را از بخش secrets/config میزبان تنظیم کنید.
4. `DATABASE_PATH` و `UPLOADS_DIR` را روی volume پایدار قرار دهید؛ روی مسیر موقت deploy قرار ندهید.
5. قبل از migration، از database و uploads بکاپ بگیرید.
6. پس از deploy، `npm run check`، health/HTTP، ورود سایت، پیام خصوصی، upload و اتصال bot را روی حساب آزمایشی بررسی کنید.

## اتصال ربات
- `RUBIKA_BOT_TOKEN` و `RUBIKA_BOT_USERNAME` را در environment سرور وارد کنید.
- polling ربات در همان process سایت فعال می‌شود.
- برای اتصال حساب، کاربر از گفتگوی خصوصی ربات وارد/ثبت‌نام می‌شود.
- Location فقط با ورود به «افراد نزدیک» و لمس دکمه اشتراک موقعیت درخواست می‌شود.
- خریدهای فروشگاه ربات از کیف پول ACE CLUB هستند؛ پرداخت رسمی Rubika در این نسخه فعال نیست.

## بکاپ و بازیابی
- قبل از هر deploy از `DATABASE_PATH`، پوشه `UPLOADS_DIR` و در صورت نیاز فایل sessions backup بگیرید.
- از بکاپ در مسیر عمومی web root نگهداری نکنید.
- بکاپ را رمزگذاری کنید و دسترسی را محدود کنید.
- بازیابی دیتابیس فقط پس از خاموش‌کردن سرور انجام شود؛ پس از restore، uploads هماهنگ با دیتابیس بازیابی شوند.
- `.env`، توکن، sessions، recovery key و دیتابیس کاربران را به GitHub یا ZIP عمومی ارسال نکنید.

## تست پس از deploy
- `npm run check`.
- ثبت‌نام/ورود حساب آزمایشی و اتصال ربات.
- پیام سایت به ربات و ربات به سایت.
- درخواست پیام حساب خصوصی و پذیرش.
- تیکت و پاسخ مدیر.
- Location opt-in، افراد نزدیک، غیرفعال‌سازی و انقضای ۳۰ دقیقه.
- match سایت↔ربات، پیام ناشناس، next/end/report/block.
- خرید اشتراک/محصول از کیف پول و بررسی transaction/ownership.
- خروج ربات و اتصال مجدد.

**تست زنده API روبیکا و پرداخت باید روی حساب آزمایشی و پس از deploy انجام شود.**
