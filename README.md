# CIDA POS — ระบบ POS ทัณฑสถานบำบัดพิเศษกลาง

Next.js 16.3.8 / React / TypeScript with **Cloudflare D1** for POS data and a **private Cloudflare R2 bucket** for product images, receipt logos and sales-reset archives. Prisma generates TypeScript model types only; runtime queries use native D1 bindings and atomic batches.

## Local development (Windows)

Use Node.js 22+ and npm. Local D1/R2 are provided by Wrangler and need no PostgreSQL service:

```powershell
npm ci
node scripts/prepare-local.mjs
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. Initial account passwords are generated into ignored `.local-access.txt`; existing passwords are preserved. Local D1 and R2 persist under ignored `.wrangler/state/`. Do not delete this directory to upgrade the schema. The seed contains the 91 spreadsheet menus and preserves later edits.

## Cloudflare D1 + R2

The deployed POS is [https://poscida.dpdns.org](https://poscida.dpdns.org), using database `cida-pos` and private bucket `cida-pos-private`. See [Cloudflare deployment and migration](docs/CLOUDFLARE.md) for the verified migration, setup, free-tier limits and deployment steps.

Push to GitHub `main` to update the website automatically. [Deploy POS to Cloudflare](.github/workflows/deploy.yml) checks out the source, runs isolated financial tests, builds the Worker and static assets, deploys them to Cloudflare, and checks the live HTTPS site. Build status and manual reruns are available in [GitHub Actions](https://github.com/M4rthin9/CidaPOS/actions/workflows/deploy.yml).

Cloud credentials belong in ignored `.env.cloudflare.local`. Deployment uses D1/R2 bindings directly, so R2 access keys are not shipped to the browser or required in the Worker. The database stores image URLs and archive checksums rather than large file contents. Media routes require a staff session; sales archives require Super Admin.

```powershell
npm run cf:setup
npm run db:migrate:remote
npm run cf:build
npm run cf:deploy
```

Application variables: `APP_ORIGIN` must match the exact URL staff use, `COOKIE_SECURE` is true for HTTPS and false only for local/LAN HTTP, and `SEED_ADMIN_PASSWORD` / `SEED_CASHIER_PASSWORD` are used only to initialize new accounts. `DATABASE_URL` is read only by the legacy PostgreSQL export helper; the application no longer uses it.

## การใช้งาน

- `/login`: เข้าสู่ระบบด้วยบัญชีเจ้าหน้าที่
- `/pos`: หมวด → แตะสินค้า → รับชำระ → เก็บบิล/เลขคิว → ส่งพิมพ์ → ขายบิลต่อไป
- F1–F7 ตามหมวดที่ตั้งไว้, F8 พักบิล, F9 ชำระเงิน, `/` ค้นหา, Enter รับชำระ, Esc ปิดหน้าต่าง
- ตัวเลือกและหมายเหตุเปิดจากรายการในตะกร้า; สินค้าเดิมไม่มีตัวเลือกจะรวมจำนวนในแถวเดียว
- ตะกร้าและคำขอชำระรอผลเก็บในเครื่องตามผู้ใช้/terminal; การ refresh ไม่สร้างบิลซ้ำ
- ส่วนลดเฉพาะผู้มีสิทธิ์; รองรับเงินสด QR/โอน และอื่น ๆ โดย QR/โอนต้องยืนยันรับเงินจริง ไม่มี payment gateway อัตโนมัติ
- `/admin/products`, `/admin/categories`: เพิ่ม/แก้ไข ราคา รูป ตัวเลือก หมวด ปุ่มลัด ลำดับ สถานะ โปรด และเก็บถาวร; ลากรายการสินค้าสลับลำดับ
- `/admin/dashboard`: ยอดประจำวัน สัดส่วนหมวด เทียบวันก่อน และสินค้าขายดี
- `/admin/orders`: ค้นหา/กรองบิล รายละเอียด พิมพ์สำเนา ยกเลิก และคืนเงินตามสิทธิ์
- `/admin/reports`: วันที่ หมวด สินค้า ผู้ขาย เครื่อง วิธีชำระ สถานะ; ส่ง CSV UTF-8 BOM เปิดใน Excel ได้ หรือพิมพ์/Save as PDF จากเบราว์เซอร์
- `/admin/closings`: เงินสดจริง − ตามระบบ; ต้องมีเหตุผลเมื่อยอดต่าง; ปิดแล้วล็อกการขายและการปรับบิล
- `/admin/users`, `/admin/audit`: บัญชี/บทบาทและประวัติการเปลี่ยนข้อมูล
- `/admin/settings`: รูปแบบใบเสร็จ บล็อก ตัวอย่างทันที อุปกรณ์ พื้นที่พิมพ์ และเส้นทางใบครัว

เฉพาะ **Super Admin** เห็นเมนู **รีเซ็ตยอดขาย** ในหลังบ้าน (`/admin/sales-reset`) และแท็บเดิมในการตั้งค่า หน้ารวมแสดงจำนวนบิล รายการสินค้า การรับชำระ การปรับยอด ปิดยอด สรุปยอด งานพิมพ์ และบิลพัก ก่อนรีเซ็ตต้องตรวจสอบข้อมูล ระบุเหตุผล รหัสผ่าน และพิมพ์ `RESET ALL SALES` ระบบเก็บข้อมูลขายเดิมไว้ในประวัติที่ดาวน์โหลดเป็น JSON ได้ แล้วเริ่มยอดขายใหม่ทุกวันทุกเครื่อง รวมบิลพัก งานพิมพ์ และปิดยอด สินค้า หมวด ผู้ใช้ การตั้งค่า และบันทึกตรวจสอบยังอยู่ เลขบิล/คิวเดินต่อโดยไม่ใช้เลขเดิมซ้ำ เครื่องขายที่โหลดรายการใหม่จะใช้ตะกร้าว่าง ระบบปฏิเสธคำขอรับชำระเดิมที่เก็บก่อนรีเซ็ต และไม่รีเซ็ตเมื่อมีงานกำลังพิมพ์

## บทบาทและความปลอดภัย

`SUPER_ADMIN` มีสิทธิ์ทั้งหมดรวมเปิดรอบแก้ไข; `ADMIN` จัดการระบบ; `MANAGER` จัดการการขาย/ปรับยอด/ปิดวัน; `ACCOUNTING` รายงานและปิดยอด; `CASHIER` ขาย พักบิล ดูและพิมพ์บิลตนเอง เพิ่มเมนูและอ่านรายงาน; `VIEWER` อ่านรายงาน ดูรายละเอียดสิทธิ์ย่อยใน `src/lib/permissions.ts` API ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทุกครั้ง

หน้าขายมีปุ่ม **เพิ่มเมนู** และ **รายงานประจำวัน** เปิดหน้าต่างโดยคงตะกร้าเดิมไว้ เพิ่มเมนูจะเลือกหมวดที่กำลังดูให้อัตโนมัติและโหลดรายการใหม่หลังบันทึก พนักงานขายเพิ่มเมนูได้ แต่แก้ไขเมนูเดิมไม่ได้หากไม่มีสิทธิ์นั้น รายงานเลือกวันและพิมพ์ได้

หน้าขาย → **รายงานประจำวัน** → **พิมพ์ 58 มม.** ให้พนักงานขายพิมพ์สรุปจากหน้าขายโดยคงตะกร้าเดิมไว้ รายงานบนกระดาษมีชื่อหน่วยงาน วันทำการ ชื่อหมวดกับยอดสุทธิของแต่ละหมวด และยอดรวมประจำวัน รวมหมวดที่ยอดเป็นศูนย์ ไม่แสดงจำนวนบิล จำนวนชิ้น วิธีชำระเงิน หรือรายละเอียดส่วนลด/ยกเลิก/คืนเงิน ตัวเลขสุทธิยังหักส่วนลดและคืนเงิน และไม่รวมบิลยกเลิก

รายงาน POS ใช้หน้ากระดาษ 58 มม. พื้นที่พิมพ์ 384 จุดและภาพข้อความภาษาไทย ไม่เปิดลิ้นชักและไม่เพิ่มยอดขาย งานพิมพ์เก็บยอด ณ เวลาสั่งพิมพ์ หากไม่พบ iMin จะใช้หน้าต่างพิมพ์ผ่านคอมพิวเตอร์อัตโนมัติ หากงานล้มเหลวให้ตรวจสอบกระดาษแล้วใช้ปุ่ม **รายงาน [วันที่] · พิมพ์สำเนา** บนหน้าขาย ดูการตั้งค่าเครื่องจริงใน [คู่มือ](docs/IMIN.md)

หลังบ้าน → **ภาพรวมวันนี้** แสดงกราฟยอดสุทธิรายวันเลือกได้ 7 หรือ 30 วัน กราฟเปรียบเทียบหมวดเลือกยอดขายหรือจำนวนชิ้น และกราฟสัดส่วนรายได้พร้อมตัวเลขและเปอร์เซ็นต์ ใช้ข้อมูลวันทำการจริง รวมวันที่ไม่มียอดขายเป็นศูนย์

หลังบ้าน → **พิมพ์ A4** ใช้รายงานเฉพาะสำหรับกระดาษ A4 แนวตั้ง แสดงช่วงวันที่และตัวกรองที่เลือก ข้อมูล ณ เวลาที่โหลด ยอดรวม ตารางหมวดสินค้า วิธีชำระเงิน การปรับยอด สินค้าขายดี และช่องลงชื่อ ไม่พิมพ์เมนูหรือกราฟหน้าจอ ตารางต่อหลายหน้าได้พร้อมหัวตารางและเลขหน้า เมื่อเลือกเฉพาะหมวดหรือสินค้า จะไม่แสดงยอดชำระที่แยกจากบิลรวมไม่ได้ เลือก A4 ขนาด 100% และปิดหัว/ท้ายหน้าของเบราว์เซอร์ หรือเลือก Save as PDF

รหัสผ่าน bcrypt; session token แบบสุ่มและเก็บ hash ในฐานข้อมูล; cookie HttpOnly/SameSite strict; session 8 ชั่วโมง; จำกัดความพยายาม login; mutation ตรวจ Origin. การแก้ผู้ใช้ยกเลิก session เก่า ห้ามลบรายการขายที่สำเร็จ ปรับผ่าน VOID/REFUND พร้อมเหตุผลและผู้อนุมัติเท่านั้น Audit, payment, adjustment, snapshot และ closing มี SQLite trigger ใน D1 ป้องกันแก้/ลบ

## หลักการเงิน

เงินทั้งหมดเป็น integer satang. เซิร์ฟเวอร์อ่านราคา/ตัวเลือกจากฐานข้อมูลเอง คำนวณส่วนลดและเงินทอนใหม่ เก็บ snapshot รายสินค้าและหมวด. ส่วนลดและคืนเงินบางส่วนจัดสรรตามสัดส่วนยอดสินค้าโดยรักษาทุกสตางค์ ไม่ได้ยืนยันการคืนจำนวนชิ้นจริง: สถิติจำนวนชิ้นเป็นยอดขายก่อนหักจำนวนคืน

คำขอรับชำระมี UUID + hash ของ payload; retry ด้วย key เดิมคืนบิลเดิม ไม่สร้างซ้ำ. row lock วันทำการครอบรับชำระ ปรับยอด สรุปรอบ และปิดวัน ทำให้ปิดวันไม่แข่งกับบิลเข้าใหม่ ทุกส่วนของยอดขายและงานพิมพ์บันทึกใน transaction เดียว

วันทำการใช้ Asia/Bangkok และเวลาเริ่มวันที่ตั้งค่า (ค่าเริ่มต้น 00:00) สรุปยอดทั้งวันตั้งแต่เริ่มวันทำการถึงก่อนเวลาเริ่มวันถัดไป รายงาน หน้าตาราง CSV และใบพิมพ์แสดงยอดรวมรายวัน ยกเลิกการแบ่งตามรอบและการบันทึกยอดรอบ ข้อมูลยอดรอบเดิมยังเก็บอยู่ในฐานข้อมูลและไม่ถูกลบ

เวลาเริ่มวันทำการต้องกำหนดก่อนบันทึกการขายครั้งแรก การเปลี่ยนภายหลังต้องเป็นการย้ายข้อมูลวันทำการที่ตรวจสอบเป็นงานแยก ระบบจึงป้องกันการแก้ค่านี้เมื่อมีบิลแล้ว วันเดิมใช้เวลาเริ่มวันที่เก็บไว้กับวันทำการ

คืนเงิน/ยกเลิกที่เกิดภายหลังแสดงเป็นยอดปรับของวันขายเดิมตาม ledger; snapshot ที่บันทึกก่อนปรับคงเดิม. วันปิดแก้บิลไม่ได้จน SUPER_ADMIN เปิดรอบแก้ไขพร้อมเหตุผล; ประวัติปิดยอดทุก revision ยังคงอยู่ เวลาปิดร้านใน settings เป็นเวลาแสดง/ตั้งแผน; การล็อกยอดเกิดเมื่อเจ้าหน้าที่ยืนยันปิดยอด

## ระบบพิมพ์ iMin

ดู [รายละเอียด iMin และขั้นตอนทดสอบเครื่องจริง](docs/IMIN.md). SDK ทางการถูกเก็บใน `public/vendor/` และฟอนต์ไทยเก็บใน `public/fonts/` พร้อม OFL license. หน้าขายพยายามใช้ iMin local print service ก่อน หากไม่พบ SDK เครื่องไม่เชื่อมต่อ หรือไม่ตอบรับระหว่างตรวจสอบก่อนพิมพ์ จะเปิดหน้าต่างพิมพ์ผ่านคอมพิวเตอร์ให้อัตโนมัติ ทั้งใบเสร็จและรายงานประจำวัน โดยคงโปรไฟล์กระดาษ 58 มม. เลือกเครื่องพิมพ์ที่ติดตั้งในคอมพิวเตอร์ แล้วกดพิมพ์และยืนยันเมื่อกระดาษออกจริง

หาก iMin เริ่มพิมพ์แล้วล้มเหลว ระบบจะเก็บงานไว้ให้ตรวจสอบและพิมพ์สำเนา ส่วนกรณีกระดาษหมดหรือเปิดฝาเครื่อง ให้แก้ที่เครื่อง iMin ก่อนลองใหม่ การเปลี่ยนไปเครื่องพิมพ์คอมพิวเตอร์อัตโนมัติเกิดก่อนส่งเนื้อหาใบเสร็จเท่านั้น

iMin เป็นตัวเลือกเริ่มต้นของเครื่อง POS ใหม่ ทางเลือก **แล็ปท็อป / เครื่องพิมพ์ใบเสร็จอื่น** ในแท็บอุปกรณ์ POS ใช้ไดรเวอร์เครื่องพิมพ์ที่ติดตั้งในคอมพิวเตอร์ เลือกกระดาษให้ตรงกับโปรไฟล์ ขนาด 100% ปิดหัว/ท้ายหน้าและระยะขอบ พิมพ์จากหน้าต่างใบเสร็จ แล้วกด **ยืนยันพิมพ์ออกแล้ว** เมื่อมีกระดาษจริง การยกเลิกจะไม่บันทึกว่างานพิมพ์สำเร็จ เส้นคั่นใช้ความกว้างพื้นที่พิมพ์จริงโดยหักระยะขอบที่ตั้งไว้

Print jobs มี PENDING → PRINTING → PRINTED/FAILED; สำเนาใช้ REPRINTED. เมื่อเครื่องปิดหลังบันทึก บิลยังอยู่และเรียกงานที่ยังไม่ยืนยันได้ ใช้ explicit recovery กรณี PRINTING ค้างเกินหนึ่งนาที เพราะไม่สามารถพิสูจน์ได้ว่ากระดาษพิมพ์ไปแล้วก่อนดับเครื่อง สำเนาติดเครื่องหมายและมี audit การพิมพ์ไม่สร้างคำสั่งขายใหม่

Mock adapter ต้องเลือกเองใน admin; เครื่องทั่วไปไม่แสร้งว่าเป็น iMin. Browser adapter เปิดตัวอย่างแต่ไม่อ้างว่าพิมพ์สำเร็จ. ใบครัวไม่แสดงราคา; schema/routing/renderer พร้อม แต่ transport เครื่องพิมพ์เครือข่ายยังไม่ติดตั้ง

## ตรวจสอบและ production build

```powershell
npm run typecheck
npm test
npm run test:integration
npm run test:browser
npm run cf:build
npm start
```

Integration ใช้ Cloudflare D1/R2 emulator ที่แยกจากฐานใช้งานจริง ไม่ใช้ PostgreSQL. Browser tests ใช้ Google Chrome ที่ติดตั้งและ dev server port 3000; มีการสร้างบิลจริงในฐาน development พร้อมภาพใน `test-results/` ห้ามรัน browser tests บน production. Unit tests ตรวจ satang, change, allocations, daily totals, timezone, refund, dynamic categories และสิทธิ์. Integration ตรวจ transaction rollback, concurrent duplicate/refund, close locks และ immutable triggers.

## Backup / Restore

Use D1 Time Travel and regular D1 exports for database recovery, and preserve the private R2 bucket separately. D1 metadata alone cannot restore archived sales or images whose objects have been removed. See [Cloudflare operations](docs/CLOUDFLARE.md). The original PostgreSQL schema, migrations and deployment examples are retained under `prisma/legacy-postgresql` and `docs/legacy-postgresql` for rollback/reference; they are not the current deployment path.

## ข้อจำกัดที่ต้องยืนยันก่อนเปิดใช้งานจริง

ยังไม่มีเครื่อง iMin จึงยังไม่ได้ผ่านการพิมพ์ไทย/ชุดตัด/ลิ้นชัก/ความเร็วบนฮาร์ดแวร์จริง Cloudflare Worker ต้องทดสอบ CPU/ปริมาณงานตาม plan ก่อนเปิดขายจริง. ไม่มี full offline checkout, gateway ยืนยัน QR, native APK, XLSX binary export, physical-item refund tracking หรือ network printer transport. รายงาน CSV เปิด Excel ได้ และ PDF ผ่าน print report. ควรทดสอบปริมาณงานจริงบนเซิร์ฟเวอร์/เครือข่ายของหน่วยงาน รายละเอียดสถาปัตยกรรมอยู่ใน [ARCHITECTURE](docs/ARCHITECTURE.md).
