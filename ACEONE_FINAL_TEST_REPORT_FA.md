# گزارش تست ACEONE Final Release

## نتایج قابل اجرا در این محیط
- بررسی Syntax سرور: PASS
- بررسی Syntax ربات: PASS
- بررسی Syntax فرانت‌اند و game files: PASS
- بررسی ایستا: 62/62 PASS
- بررسی فشرده‌سازی ZIP: پس از ساخت نهایی انجام می‌شود.

## محدودیت‌های محیط
- `npm ci` به علت timeout در دریافت dependencies کامل نشد.
- اجرای سرور/HTTP با scratch database انجام نشد؛ Express در نصب ناقص موجود نبود.
- Node در محیط 22.16.0 است، اما پروژه Node 24.x را مشخص کرده است.
- API token روبیکا، حساب آزمایشی و پرداخت رسمی در دسترس نیست؛ تست زنده انجام نشده.

## موارد نیازمند تست بعد از نصب
- Startup + HTTP روی Node 24
- Migration روی کپی دیتابیس واقعی (نه دیتابیس اصلی)
- DM سایت↔ربات، درخواست پیام حساب خصوصی، read receipts
- Ticket create/history/reply
- Location picker و حذف موقعیت
- Random matching سایت↔ربات، send/next/end/report/block
- فروشگاه و تراکنش/مالکیت محصول
- Logout/relink

62/62 بررسی ایستا، تست live/integration محسوب نمی‌شود.
