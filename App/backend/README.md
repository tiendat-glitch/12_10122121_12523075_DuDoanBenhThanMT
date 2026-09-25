# Backend — Node.js / Express

Backend nhận dữ liệu từ frontend, kiểm tra schema, gọi AI Service và lưu lịch sử vào MongoDB. Xem [README hệ thống](../../README.md).

## Cấu trúc

```text
src/
  config/         env.js, db.js
  controllers/    health.controller.js, prediction.controller.js
  routes/         health.routes.js, prediction.routes.js, model.routes.js
  services/       prediction.service.js, model.service.js
  middlewares/    error.middleware.js, validation.middleware.js
  utils/          response.js, logger.js
  app.js
  server.js
tests/
  api.test.js
```

app.js ghép middleware/routes. server.js đọc schema, kết nối MongoDB và mở port; đóng kết nối khi shutdown.

## Chạy Docker

Tại **gốc hệ thống** chứa docker-compose.yml:

```powershell
docker compose up --build -d
docker compose logs -f backend
```

docker-compose.yml trong thư mục backend include stack gốc. Root .env cấu hình toàn bộ hệ thống; schema được mount read-only từ ai-models/models/.
Không chạy uvicorn cho backend; uvicorn chỉ dùng ở AI Service.

## Chạy riêng ngoài Docker

Cần Node.js >=20 và AI/MongoDB đang chạy. Trong app/backend:

```powershell
# Chỉ copy khi chưa có .env:
Copy-Item .env.example .env
npm ci
npm start
```

Sửa AI_SERVICE_URL và MONGODB_URI theo môi trường thực tế. MongoDB của stack Docker mặc định không publish cổng host.
SCHEMA_PATH mặc định trỏ đến schema trong repo.

| Biến | Ý nghĩa |
|---|---|
| PORT | Cổng backend |
| AI_SERVICE_URL | URL AI Service |
| MONGODB_URI | Chuỗi kết nối MongoDB |
| MONGODB_DATABASE | Tên database |
| CORS_ORIGINS | Origin frontend, phân cách bằng dấu phẩy |
| REQUEST_TIMEOUT_SECONDS | Timeout AI |
| SCHEMA_PATH | Đường dẫn schema, tùy chọn khi chạy local |

## API

| Method | Endpoint | Nội dung |
|---|---|---|
| GET | /health, /api/health | Kiểm tra AI + MongoDB, port và uptime; trả 503 khi degraded |
| GET | /api/schema | Schema chung FE/BE/AI |
| GET | /api/model-info | Metadata và metric từ AI |
| POST | /api/predict | Body chứa features, đủ 24 trường |
| GET | /api/history?limit=20 | 1–100 bản ghi mới nhất; không trả đặc trưng đầu vào |

Alias /api/v1/* vẫn hoạt động.
Predict trả prediction, probability (lớp ckd), model_version, request_id, duration_ms và explanation. Backend chuyển tiếp cách tính từ AI, không tính lại pipeline.
Chỉ trả thành công sau khi lưu MongoDB. Explanation không được lưu lặp vào lịch sử.

Lỗi thống nhất gồm error, detail, request_id:

| HTTP | Trường hợp |
|---|---|
| 400 | Thiếu/sai/thừa trường, ngoài khoảng, JSON không hợp lệ |
| 413 | Body vượt giới hạn |
| 502 | AI trả lỗi hoặc phản hồi sai hợp đồng |
| 503 | Không kết nối AI hoặc lỗi lưu/đọc MongoDB |
| 504 | AI timeout |

## Log và lịch sử

Backend phát JSON log theo từng request, dùng cùng X-Request-ID với FE/AI. Không log body hoặc chuỗi kết nối.
Frontend không hiển thị bảng lịch sử; MongoDB và /api/history vẫn hoạt động để kiểm chứng yêu cầu bài tập. History hiện là lịch sử chung của bản demo.

## Kiểm thử

Trong app/backend:

```powershell
npm ci
npm test
```

Tests dùng AI/DB giả lập cho nhánh lỗi. Kiểm tra toàn luồng với service thật từ gốc repo:

```powershell
python scripts/check_step5.py --backend-url http://localhost:3000/api --ai-url http://localhost:8001
```

Xem thêm [hướng dẫn bước 5](../../HUONG_DAN_BACKEND_MUC_5.md).
