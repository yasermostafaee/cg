# درخواست CG Control از تیم Apasai Playout: قرارداد رسمی بررسی زندهٔ یک ورودی

> لطفاً این فایل را به‌عنوان یک درخواست **خواندن و پاسخ مستند** به تیم Playout بدهید. برای پاسخ‌دادن لازم نیست
> هیچ ورودی، Preview یا PGM را start/stop کنید. لطفاً پاسخ را از source، تست و OpenAPI تولیدشده بدهید و اگر موردی
> هنوز قرارداد ندارد، صریحاً همان را بنویسید؛ نام یا شکل فیلدی را حدس نزنید.

- **تاریخ:** 2026-10-26
- **مبدأ:** CG Control / CG Bridge
- **Playout مشاهده‌شده:** `2.12.0` روی `192.168.21.112`
- **قابلیت CG:** `C-023` / OpenSpec `preview-live-input-check`
- **وضعیت پیاده‌سازی CG:** `BLOCKED / WAITING FOR PLAYOUT CONTRACT`

## هدف اپراتوری

اپراتور باید قبل از air بتواند **فقط یک ورودی زنده** را در بخش PVWِ CG Control بررسی کند:

- تصویر متحرک فعلی ورودی؛
- صدای اختیاری، همیشه در شروع خاموش و فقط با gesture کاربر روشن؛
- یک متر جدا با عنوان `PVW INPUT` که فقط همان Preview را نشان دهد؛
- شروع همان بررسی از داخل Source defaults، بدون save یا تغییر Source default.

این قابلیت نباید تحت هیچ شرایطی PGM، Playlist، لایه‌های برنامه، look جاری، Source defaults یا VU فعلی PGM را
تغییر دهد. CG Bridge مالک کل lifecycle خواهد بود و مرورگر مستقیماً به API یا پورت خام Playout وصل نمی‌شود.

## یافته‌های فقط‌خواندنی ما

در این بررسی هیچ `POST` یا `DELETE` اجرا نشد و هیچ وضعیت Playout/PGM تغییر نکرد. این موارد از endpoint عمومی،
هدرهای HTTP، changelog نصب‌شده و اسناد قبلی دو تیم به‌دست آمد:

1. `GET /api/v1/system/version` نسخهٔ `2.12.0` را گزارش می‌کند.
2. مسیر `GET /api/v1/channels/{code}/live-preview` پاسخ `405` و هدر `Allow: DELETE, POST` می‌دهد؛ پس وجود دو
   verb معلوم است، ولی DTO و پاسخ آن‌ها از این مشاهده معلوم نیست.
3. changelog می‌گوید این مسیر از `2.8.21` اضافه شده، از `2.8.22` منبع ad-hoc با `kind + address` را هم می‌پذیرد،
   از `2.8.27` منبع را روی preview layer 5 می‌گذارد تا Preview VU کار کند، و در `2.8.36` تا `2.8.39` اولویت air،
   `409` برای منبع انحصاریِ در حال استفاده، teardown پیش از take و replace ترتیبیِ Preview اصلاح شده است.
4. برای کانال برنامهٔ `N`، feed پیش‌نمایش روی `9350 + N - 1` دیده می‌شود: `GET /` تصویر MJPEG و
   `GET /audio.wav` صدای WAV/PCM s16le stereo 48 kHz. در پاسخ فعلی CORS `*` است؛ این برای طراحی CG مجوز اتصال
   مستقیم مرورگر نیست.
5. صفحهٔ `/docs` به `/openapi/v1.json` ارجاع می‌دهد، اما آن endpoint اکنون `500` می‌دهد. لاگ نصب‌شده علت را این
   طور ثبت می‌کند:

   ```text
   Swashbuckle.AspNetCore.SwaggerGen.SwaggerGeneratorException:
   The "PROPFIND" HTTP method is not supported.
   ```

در نتیجه شکل دقیق POST/DELETE، success body، error envelope و policy احراز هویت از OpenAPI قابل بازیابی نبود.

## ۱. قرارداد دقیق `POST`

لطفاً path واقعی و schema کامل JSON را برای هر دو حالت بدهید، با یک نمونهٔ copy-paste و پاسخ واقعیِ پاک‌شده:

1. **ورودی ذخیره‌شده:** فیلد دقیق شناسه چیست (`inputId` یا نام دیگر)؟ آیا `kind/address` باید غایب باشد؟ شناسه از
   کدام فیلد D10 می‌آید و در restart پایدار است؟
2. **ad-hoc:** فیلدهای دقیق `kind` و `address` چیست، چه enumهایی پذیرفته می‌شود و validation هرکدام چیست؟ CG Control
   فعلاً از این حالت استفاده نمی‌کند، اما برای فهم union و خطاها لازم است.
3. آیا body فیلد owner/client/request id، TTL یا replace policy دارد؟ `Content-Type` دقیق چیست؟
4. آیا channel در `{code}` همان D4 `code` است؟ lookup آن در primary/backup و case-sensitivity چگونه است؟
5. success دقیقاً کدام status است (`200/201/202/204`) و body چه فیلدهایی دارد؟ لطفاً schemaِ required/optional و
   forward-compatibility را بدهید.

پاسخ مطلوب باید دست‌کم هویت lease/session، generation/version، زمان انقضا و هویت preview stream/channel را به‌شکل
ماشین‌خوان حمل کند؛ اگر امروز چنین فیلدهایی وجود ندارد، لطفاً صریحاً بگویید.

## ۲. قرارداد دقیق stop و جلوگیری از race

یک `DELETE /api/v1/channels/{code}/live-preview` بدون شرط برای چند کلاینت امن نیست: dialog قدیمی می‌تواند بعد از
شروع Preview جدید، DELETE دیرهنگام بفرستد و Preview جدید را ببندد (ABA race). CG Bridge می‌تواند درخواست‌های خودش
را serialize کند، اما درخواست Playout Client یا Bridge دیگری را کنترل نمی‌کند.

لطفاً دقیقاً مشخص کنید:

- owner/lease token کجا برمی‌گردد و در DELETE در header، body یا query چگونه فرستاده می‌شود؟
- DELETE چگونه **conditional** است؛ mismatch چه status/code می‌دهد و چرا Preview جدید را متوقف نمی‌کند؟
- stop تکراری idempotent است؟ stop بعد از expiry/replacement/restart چه پاسخی دارد؟
- TTL چقدر است، heartbeat/renew دارد یا نه، و disconnect کلاینت چه اثری دارد؟
- دو POST هم‌زمان چگونه مرتب می‌شوند؟ آیا replace اتمیک است و پاسخ قبلی چگونه revoked می‌شود؟
- آیا owner می‌تواند بفهمد Preview به‌علت take/cue/dispatch/preload یا air-priority بسته شده است (SSE، SignalR،
  polling یا error/state endpoint)؟ payload دقیق آن چیست؟
- restart موتور/API، تغییر primary/backup و crash بین POST و دریافت پاسخ چه semanticsی دارند؟

اگر API فعلی owner token و conditional stop ندارد، لطفاً یک نسخهٔ افزایشی پیشنهاد/پیاده‌سازی کنید؛ CG این قابلیت را
با DELETE بدون مالکیت منتشر نخواهد کرد.

## ۳. احراز هویت و مجوز

لطفاً policy دقیق روی POST و DELETE را با نام policy/role/scope/claim بدهید:

- `Authorization: Bearer <JWT>` لازم است؟ آیا token حساب `cg-bridge` پذیرفته می‌شود یا فقط token کلاینت Playout؟
- حداقل role و permission چیست؟ آیا claim کانال بررسی می‌شود و `{code}` چگونه با آن join می‌شود؟
- آیا یک service account برای CG Bridge لازم است؛ lifecycle رمز/refresh/revocation آن چیست؟
- `401` و `403` دقیقاً چه تفاوت و error body/code پایداری دارند؟ disabled user و expired access/refresh چه می‌شوند؟
- آیا CG JWT فعلی که برای D4/D10/D11 و meter استفاده می‌شود مجاز است؟ اسناد قبلی می‌گویند حساب‌های CG به خود
  Playout Client دسترسی ندارند؛ لطفاً مرز این endpoint را صریح کنید.
- CORS برای این طراحی مبنا نیست: درخواست control و feed را Bridge server-side می‌خواند. token هرگز نباید در URL
  قرار گیرد.

## ۴. خطاها و availability

برای `400`, `401`, `403`, `404`, `409`, `423`, `429` و `5xx` (هرکدام که واقعاً ممکن است) لطفاً status، body،
machine code پایدار، متن قابل‌نمایش و retryability را بدهید. به‌خصوص:

- source id حذف‌شده، unavailable، incompatible با channel یا malformed؛
- ورودی انحصاری که holder/air/Preview دیگری آن را در اختیار دارد؛
- channel code نامعتبر یا preview channel آماده‌نشده؛
- teardown timeout، core restart و feed port unavailable؛
- تفاوت «Preview با دیگری جایگزین شد» با «منبع برای air آزاد شد».

CG متن reason را با نام انسانی source نمایش می‌دهد، ولی id/address/token را نمایش یا log نمی‌کند.

## ۵. نگاشت کانال، پورت و format تصویر/صدا

لطفاً این قرارداد را رسماً تأیید یا اصلاح کنید:

- برنامهٔ channel `N` → Preview feed روی `9350 + N - 1`؛ آیا `N` شمارهٔ Caspar/program channel است یا ترتیب دیگری؟
- آیا responseِ POST باید URL/port را برگرداند تا CG از arithmetic مستقل باشد؟ رفتار channelهای بالاتر از 20 چیست؟
- `GET /` دقیقاً HTTP version، multipart boundary، `Content-Length`, MIME، resolution, fps، cache و stall semantics؛
- `GET /audio.wav` دقیقاً header، sample rate، channels، sample format، frame alignment، latency و silence/stall؛
- محدودیت concurrent reader و CPU/network cost؛ آیا یک reader picture و یک reader audio امن است؟
- firewall و bind address برای `9350–9369`؛ آیا دسترسی باید به ماشین Bridge محدود شود؟
- آیا feed فقط بعد از POST معتبر است و چه زمانی پس از success آماده می‌شود؟ teardown چه زمانی تمام می‌شود؟
- آیا تصویر/صدا هویت lease/generation را حمل می‌کند تا frame دیرهنگام با Preview جدید اشتباه نشود؟

## ۶. قرارداد متر `PVW INPUT`

متر فعلی CG Control از برنامه می‌آید و باید همان `PGM` باقی بماند. برای بررسی ورودی، یک متر **جدا** لازم است که فقط
Preview انتخاب‌شده را نشان دهد.

لطفاً endpoint/transport رسمی متر Preview را مشخص کنید:

- آیا `GET /api/cg/meters` رویداد preview channel/layer 5 را هم می‌فرستد؟ event type و DTO دقیق چیست؟
- preview را با چه stable channel/id و lease/generation به POST مربوط کنیم؟
- تعداد busها، واحد/scale، cadence، stale threshold و silence/floor چیست؟
- آیا meter بدون بازکردن `/audio.wav` کار می‌کند؟ اگر نه، آیا یک endpoint level-only اضافه می‌شود؟
- با یک تا چهار ورودی روی air، meter برنامه همچنان mix نهایی را نشان می‌دهد و Preview meter فقط input انتخاب‌شده را؛
  لطفاً تأیید کنید هیچ event برنامه به‌عنوان input نسبت داده نمی‌شود.

اینکه changelog می‌گوید layer 5 برای Preview VU انتخاب شده، جهت طراحی را نشان می‌دهد، اما جای DTO و correlation
رسمی را نمی‌گیرد.

## ۷. air priority و Input Holder

لطفاً برای sourceهای direct و holder-routed، به‌ویژه SDI/SRT/NDI/RTP/RTMP، دقیق کنید:

- POST برای ورودی ذخیره‌شده بر اساس id چگونه تصمیم می‌گیرد direct باز کند یا holder route را مصرف کند؟
- آیا Preview و air می‌توانند producer مشترک داشته باشند، یا air همیشه Preview را می‌بندد؟
- `409` دقیقاً در کدام حالت است و response reason/source state چیست؟
- take/cue/dispatch/preload ابتدا lease را revoke می‌کند، منتظر teardown می‌ماند و سپس air را ادامه می‌دهد؟ timeout و
  failure policy چیست؟
- برای SRT و منابع single-open، تضمین `2.12.0` علیه double-open چگونه در API observable می‌شود؟
- Playlist output باید قابل Preview باشد یا عمداً از این قابلیت خارج است؟ اگر خارج است code/reason پایدار چیست؟

## ۸. ضمانت‌های لازم برای پذیرش CG

لطفاً در پاسخ نسخه‌دار این موارد را صریحاً تضمین کنید:

1. live-preview فقط preview channel را تغییر می‌دهد و هرگز PGM/programme layer یا Playlist را تغییر نمی‌دهد.
2. یک lease مالک‌دار با TTL و stop شرطی وجود دارد؛ cleanup قدیمی Preview جدید را نمی‌بندد.
3. air همیشه اولویت دارد و revocation آن برای Bridge قابل مشاهده است.
4. picture، optional sound و meter هر سه به همان lease قابل correlation هستند.
5. sound در CG off-by-default است و بازنکردن آن مانع picture/meter نمی‌شود.
6. متر Preview از PGM جداست؛ VU فعلی PGM و mix یک تا چهار ورودی هیچ تغییری نمی‌کند.
7. Bridge می‌تواند همهٔ منابع را روی close/replacement/disconnect/TTL/restart بدون blind DELETE پاک کند.
8. پاسخ‌ها و خطاها هیچ credential یا URL حساس را به UI تحمیل نمی‌کنند.

## خروجی درخواستی از تیم Playout

لطفاً یک فایل پاسخ نسخه‌دار شامل موارد زیر برگردانید:

- OpenAPI اصلاح‌شده یا export مستقلِ فقط عملیات live-preview و meter؛
- JSON Schema و نمونهٔ واقعیِ پاک‌شده برای POST success، conditional DELETE success/mismatch و تمام خطاها؛
- نام policy/role/scope و نمونهٔ header احراز هویت؛
- sequence diagram برای start → feed/meter → replace → conditional stop و air revocation؛
- تست خودکار قرارداد که raceِ POST جدید + DELETE قدیمی را پوشش دهد؛
- شمارهٔ حداقل نسخه‌ای که این قرارداد در آن قابل اتکاست و migration/compatibility برای `2.12.0`.

تا دریافت این پاسخ، CG فقط مستند طراحی دارد و هیچ body یا DELETE حدسی در production پیاده نمی‌کند.
