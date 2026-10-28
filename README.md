# Hệ thống chấm công doanh nghiệp

Web app chấm công self-hosted cho doanh nghiệp vừa và nhỏ: nhân viên chấm công trên web/điện thoại (kiểm tra IP mạng nội bộ hoặc GPS), đồng bộ log từ máy chấm công vân tay/khuôn mặt ZKTeco, quản lý ca làm, nghỉ phép, tăng ca, giải trình và xuất bảng công tháng ra Excel.

**Stack:** Node.js 22.13+ (khuyến nghị LTS mới nhất) · Express · SQLite built-in của Node (`node:sqlite`, WAL mode) · Frontend vanilla JS (ES modules, không cần build).

Không có thư viện native nào phải compile, nên `npm install` chạy được ngay trên Windows mà không cần Visual Studio hay Python.

## Tính năng

| Nhóm | Chi tiết |
|---|---|
| Chấm công web | Nút chấm vào/ra, kiểm tra theo **IP allowlist (CIDR)**, **GPS geofence**, hoặc kết hợp. Chặn chấm liên tiếp, ghi IP + toạ độ mỗi lượt. Có thể tắt chấm web cho từng người (VD công nhân chỉ chấm máy). |
| Máy chấm công | Kéo log trực tiếp từ ZKTeco qua port 4370, tự sync định kỳ, **agent** cho chi nhánh/server cloud, nhập file `attlog.dat` từ USB, CSV, XLSX. Map theo *User ID trên máy* hoặc mã NV, tự bỏ bản ghi trùng. |
| Ca làm việc | Nhiều ca, ca qua đêm, nghỉ giữa ca, ân hạn đi muộn/về sớm, ngày làm việc, làm nửa ngày (sáng T7), ca mặc định. |
| Tính công | Giờ vào/ra, phút muộn/sớm, giờ làm thực tế trừ nghỉ giữa ca, công theo tỷ lệ, thiếu chấm công, vắng, nghỉ lễ hưởng lương, OT theo hệ số 150/200/300% (chỉ tính khi đơn OT được duyệt **và** có giờ ra tương ứng). |
| Đơn từ | Nghỉ phép (phép năm có kiểm tra quỹ phép, việc riêng có lương, ốm BHXH, không lương, nửa ngày), đăng ký OT (giới hạn 40h/tháng), giải trình quên chấm. Duyệt/từ chối có lý do; duyệt giải trình tự bổ sung lượt chấm. |
| Bảng công | Lưới tháng có màu theo trạng thái, lọc phòng ban, click xem chi tiết từng ngày, **xuất Excel** 3 sheet (Bảng công có ô ký, Chi tiết, Ký hiệu). |
| Phân quyền | **Admin**: toàn quyền. **Quản lý**: xem bảng công, nhật ký và duyệt đơn của phòng ban mình. **Nhân viên**: chấm công, xem công, gửi đơn. |
| Bảo mật | Mật khẩu bcrypt, session JWT trong cookie `httpOnly` + `SameSite=Strict`, buộc đổi mật khẩu lần đầu, đổi/đặt lại mật khẩu là các phiên cũ mất hiệu lực, rate-limit đăng nhập, Helmet + CSP, **audit log** mọi thao tác quan trọng. |

## Chạy nhanh

```bash
npm install
cp .env.example .env          # sửa nếu cần (Windows: copy .env.example .env)
npm run seed:demo             # (tuỳ chọn) dữ liệu mẫu: 16 nhân viên, 45 ngày chấm công
npm start                     # http://localhost:3000
```

Tài khoản mẫu sau khi seed: `admin / Admin@123`, trưởng phòng `nv004 / Demo@123`, nhân viên `nv005 / Demo@123`.

Không chạy seed: lần khởi động đầu tiên hệ thống tạo tài khoản `admin` và **in mật khẩu ra console** (hoặc lấy từ `ADMIN_PASSWORD`).

Kiểm thử toàn bộ luồng chính (44 test case trên CSDL tạm): `npm test`

## Chạy trên Windows như một service

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start src/server.js --name chamcong
pm2 save
pm2-startup install
```

## Triển khai lên hosting cPanel (Nhân Hòa)

Yêu cầu gói hosting có mục **Setup Node.js App** và chọn được **Node.js 22** trở lên (cần bản 22.13+ để có `node:sqlite`).

1. **cPanel → Git Version Control → Create**: bật *Clone a Repository*, dán URL repo, *Repository Path* đặt `chamcong`.
   Repo private thì cần thêm SSH key của cPanel vào GitHub (Deploy key) hoặc dùng URL HTTPS kèm token.
2. **cPanel → Setup Node.js App → Create Application**:
   - Node.js version: 22.x (bản cao nhất có)
   - Application mode: Production
   - Application root: `chamcong`
   - Application URL: tên miền hoặc subdomain, VD `chamcong.congty.vn` (nên dùng subdomain riêng, không đặt trong thư mục con)
   - Application startup file: `app.js`
3. Trong mục **Environment variables** của app, thêm:
   ```
   TZ=Asia/Ho_Chi_Minh
   COOKIE_SECURE=true
   TRUST_PROXY=1
   ADMIN_PASSWORD=<mật khẩu admin ban đầu>
   DEVICE_API_KEY=<chuỗi ngẫu nhiên dài, nếu dùng agent>
   ```
4. Bấm **Run NPM Install**, rồi **Restart**.
5. Bật SSL cho tên miền (cPanel → SSL/TLS Status → AutoSSL). GPS trên điện thoại chỉ chạy qua HTTPS.

**Cập nhật phiên bản mới:** cPanel → Git Version Control → *Manage* → *Pull or Deploy* → *Update from Remote*, sau đó vào Setup Node.js App bấm **Restart** (chạy lại *Run NPM Install* nếu `package.json` đổi).

**Lưu ý trên hosting dùng chung:**
- Dữ liệu nằm ở `~/chamcong/data/chamcong.db`. Thư mục này không có trong git, pull code mới không ảnh hưởng. Backup bằng cPanel → Backup hoặc tải file về định kỳ.
- Hosting không đi vào được LAN công ty, nên **nút "Đồng bộ" máy chấm công sẽ không kết nối được**. Hãy chạy `scripts/zk-agent.js` trên một máy trong LAN để đẩy log lên (xem mục Máy chấm công), hoặc nhập file từ USB.
- Chấm công theo IP: khai báo **IP WAN tĩnh** của văn phòng dạng `x.x.x.x/32`. Kiểm tra IP server nhận được ở trang Cài đặt; nếu thấy IP nội bộ của hosting thì chỉnh `TRUST_PROXY`.
- Nếu gói hosting chỉ có Node.js 20 trở xuống, hãy hỏi Nhân Hòa nâng cấp, hoặc dùng VPS và chạy bằng Docker/pm2.

## Triển khai bằng Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs chamcong     # xem mật khẩu admin lần đầu
```

Dữ liệu nằm ở `./data` (file `chamcong.db`). Backup định kỳ thư mục này. SQLite chạy ở WAL mode, nên khi app đang chạy hãy dùng `sqlite3 data/chamcong.db ".backup backup.db"` để có bản sao nhất quán (hoặc dừng app rồi copy cả thư mục).

### Đưa ra Internet / HTTPS
Đặt sau Nginx hoặc reverse proxy có TLS, rồi trong `.env`:
```
COOKIE_SECURE=true
TRUST_PROXY=1        # số tầng proxy phía trước
```
Ví dụ Nginx:
```nginx
server {
  listen 443 ssl http2;
  server_name chamcong.congty.vn;
  # ssl_certificate ...;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
> GPS trên trình duyệt điện thoại **chỉ hoạt động qua HTTPS**. Trong LAN dùng HTTP thì nên chọn chế độ kiểm tra theo IP.

## Cấu hình chấm công web (Cài đặt & nhật ký)

- **Theo IP:** khai báo dải `192.168.10.0/24` (Wi-Fi văn phòng) khi server nằm trong LAN. Nếu server ở cloud, khai báo **IP WAN tĩnh** của văn phòng dạng `/32`. Trang cài đặt hiển thị IP server đang thấy từ máy bạn để kiểm tra nhanh `TRUST_PROXY`.
- **Theo GPS:** bấm "Lấy vị trí hiện tại của tôi" khi đứng tại văn phòng, đặt bán kính 100–300 m. Hệ thống tự bù sai số GPS tối đa 100 m.
- **IP hoặc GPS:** phù hợp nhất cho văn phòng có nhân viên dùng 4G.

## Máy chấm công ZKTeco

1. Khai báo máy ở **Máy chấm công** (IP, port 4370).
2. Gán **User ID trên máy chấm công** cho từng nhân viên (số ID lúc đăng ký vân tay).
3. Bấm **Đồng bộ**, hoặc đặt `AUTO_SYNC_MINUTES=10`.

Server phải đi được tới máy qua UDP/TCP 4370. Máy ở VLAN khác cần firewall policy cho phép server → máy chấm công port 4370.

**Chi nhánh / server trên cloud:** chạy agent trên một máy Windows/Linux trong LAN chi nhánh (cần Node.js):
```bash
SERVER_URL=https://chamcong.congty.vn DEVICE_API_KEY=<giống .env server> DEVICE_IP=192.168.1.201 DEVICE_ID=1 npm run agent
```
Lên lịch 10–15 phút/lần bằng Task Scheduler hoặc cron. Agent chỉ gửi log 7 ngày gần nhất (`SINCE_DAYS`), server tự bỏ trùng.

**Không kết nối được máy:** rút USB từ máy, lấy file `attlog.dat` (hoặc file export Excel của phần mềm hãng) rồi dùng **Nhật ký chấm công → Nhập file**.

## Quy tắc tính công

- Cửa sổ ghi nhận của một ngày: từ 4 giờ trước giờ vào ca, kéo dài 24 giờ. Ca đêm 22:00–06:00 được tính trọn vào ngày bắt đầu.
- Lượt chấm đầu tiên = giờ vào, lượt cuối = giờ ra. Chỉ có một lượt sau khi hết ca là **Thiếu chấm công (?)**, công = 0 cho tới khi giải trình được duyệt.
- Vào trong ân hạn (mặc định 5 phút) được tính đúng giờ. Quá ân hạn thì tính muộn từ giờ vào ca.
- Công ngày = giờ làm trong ca (trừ nghỉ giữa ca) / giờ chuẩn của ca. Làm nửa ngày (VD sáng T7) = 0,5 công khi đủ giờ.
- **Tổng công hưởng lương** = công thực tế + phép có lương (phép năm, việc riêng) + ngày lễ. Nghỉ ốm (BHXH chi trả) và không lương được thống kê riêng.
- OT tính = min(giờ OT được duyệt, giờ thực tế ở lại sau ca). Ngày nghỉ/ngày lễ tính theo toàn bộ thời gian có mặt.

## Cấu trúc mã nguồn

```
src/
  server.js              Express app, CSP, mount API, auto-sync
  config.js              Đọc .env
  db.js                  Schema SQLite, migration, settings, audit
  middleware/auth.js     JWT cookie, phân quyền, rate-limit đăng nhập
  services/calc.js       Engine tính công (ca, muộn/sớm, phép, lễ, OT)
  services/importer.js   Nhập log: ZKTeco, file attlog/CSV/XLSX, agent
  services/excel.js      Xuất Excel bảng công & nhật ký
  routes/                auth, employees, attendance, requests, reports, devices, catalog
public/
  index.html, css/app.css
  js/app.js              Router, layout, đăng nhập
  js/pages/*.js          Từng màn hình
scripts/
  seed-demo.js           Dữ liệu mẫu
  smoke-test.js          Kiểm thử end-to-end (npm test)
  zk-agent.js            Agent đồng bộ máy chấm công chi nhánh
```

## API chính

Tất cả dưới `/api`, xác thực bằng cookie (trừ `/auth/login`, `/auth/branding`, `/devices/push`).

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`, `/auth/change-password` | Đăng nhập, đổi mật khẩu |
| POST | `/attendance/checkin` | Chấm công web `{lat, lng, accuracy}` |
| GET | `/attendance/today`, `/attendance/month?month=&user_id=` | Công hôm nay / theo tháng |
| GET/POST/DELETE | `/attendance/logs` | Nhật ký thô, thêm thủ công, xoá |
| POST | `/attendance/import` | Upload file `attlog.dat`/CSV/XLSX |
| GET/POST | `/requests`, `/requests/:id/approve|reject|cancel` | Đơn từ |
| GET | `/reports/timesheet`, `/reports/timesheet/export` | Bảng công JSON / Excel |
| POST | `/devices/:id/sync`, `/devices/push` (header `x-api-key`) | Đồng bộ máy chấm công |
| CRUD | `/employees`, `/departments`, `/shifts`, `/holidays`, `/settings`, `/audit` | Quản trị |

## Gợi ý mở rộng

- Đăng nhập bằng tài khoản Active Directory (LDAP bind) thay cho mật khẩu riêng.
- Đồng bộ nhân viên hai chiều với máy chấm công (đẩy User ID, tên lên máy).
- Tính lương: thêm bảng lương cơ bản, phụ cấp, khấu trừ đi muộn dựa trên bảng công đã có.
- Chuyển sang PostgreSQL khi vượt vài trăm nhân viên hoặc cần nhiều instance.
