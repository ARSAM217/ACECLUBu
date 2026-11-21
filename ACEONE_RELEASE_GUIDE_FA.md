# راهنمای انتشار ACEONE — نسخه نهایی batch

## پیش‌نیازها
- Node.js 24.x
- `npm ci`, سپس `npm run check`
- `SESSION_SECRET` امن، حداقل ۳۲ کاراکتر
- برای ربات: `RUBIKA_BOT_TOKEN` و `RUBIKA_BOT_USERNAME`

## نصب/اجرا
```bash
cp .env.example .env
# .env را در محیط امن ویرایش کنید؛ token/secret را در Git نگذارید.
npm ci
npm run check
npm start
```

`DATABASE_PATH` و `UPLOADS_DIR` را روی volume پایدار میزبان تنظیم کنید. قبل از deploy از دیتابیس و uploads بکاپ بگیرید؛ فایل ZIP انتشار را روی داده زنده extract نکنید.

## تغییرات ربات
- پروفایل و اکسپلور واقعی، لایک و دستورات `/username`, `/like username`.
- دایرکت: `/message username`, `/open username`, `/chats`, `/reply text`, `/end`.
- پشتیبانی: عنوان/متن تیکت، تاریخچه، پاسخ از سایت به ربات.
- افراد نزدیک: موقعیت با Picker و consent، فاصله تقریبی، `/nearby`، «غیرفعال کردن مکان».
- چت تصادفی: `/random`, `/random_next`, `/random_end`, `/random_report`, `/random_block`.
- فروشگاه: شتاب‌دهی، پرو، اشتراک پیام، پروفایل شخصی؛ `/store frames|namecolors|badges`, `/buy_item item_id`, `/equip item_id`.
- خروج: «قطع اتصال» یا `/logout`.
- نصب: `https://aceclub.ir/install`.

## موارد تست بعد از deploy
با حساب آزمایشی و دیتابیس کپی، تبادل پیام سایت↔ربات، تیکت، location opt-in/off، چت تصادفی سایت↔ربات، گزارش/بلاک، خرید، خروج و اتصال مجدد را بررسی کنید. پرداخت رسمی روبیکا در این نسخه فعال نیست.

تست‌ها و محدودیت‌ها در `ACEONE_FINAL_TEST_REPORT_FA.md`.
