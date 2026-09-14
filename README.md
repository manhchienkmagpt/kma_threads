# KMA Threads

Ứng dụng mạng xã hội dạng thread, lấy cảm hứng về bố cục và trải nghiệm từ
[burakorkmez/threads-clone](https://github.com/burakorkmez/threads-clone), nhưng được xây dựng mới với
FastAPI, PostgreSQL và React/TypeScript.

## Công nghệ

- Backend: FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, JWT access/refresh, Argon2, Gemini API.
- Frontend: React 19, TypeScript, Vite, React Router, Lucide icons.
- Hạ tầng: Docker Compose, PostgreSQL 17, local media storage.
- Chất lượng: pytest, Ruff, TypeScript strict, production build.

## Chạy nhanh bằng Docker

```bash
cp .env.example .env
docker compose up --build
```

Sau khi các container chạy:

- Frontend: http://localhost:5173
- Swagger API: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- PostgreSQL: `localhost:5432`

Tạo dữ liệu demo từ snapshot của 10 hồ sơ Threads công khai (40 bài, đúng 4 bài/tài khoản,
kèm ảnh được lưu cục bộ, trả lời và đăng lại mẫu):

```bash
docker compose exec api python -m app.seed
```

Tất cả tài khoản seed dùng mật khẩu `Password123!`; tài khoản quản trị là
`threads / Password123!`. Lệnh seed chạy lặp lại an toàn và tự dọn bộ tài khoản/bài demo cũ.

Snapshot nằm tại `backend/app/seed_data/threads_seed.json`. Để crawl lại 4 bài mới nhất của
10 hồ sơ đã cấu hình và tải media về snapshot:

```bash
cd backend
python -m app.crawl_threads
```

Crawler chỉ đọc hồ sơ công khai. `THREADS_MEDIA_BASE_URL` phải là URL public trỏ tới route
`/uploads` của API (mặc định `http://localhost:8000/uploads`).

> Phần kiểm thử tự động dùng SQLite in-memory để cô lập test. Runtime và migration mặc định vẫn dùng
> PostgreSQL qua `postgresql+psycopg`.

## Chạy từng phần không dùng Docker

Yêu cầu PostgreSQL đang chạy và đã tạo database `threads`.

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

Terminal khác:

```powershell
cd frontend
npm install
npm run dev
```

Khi chạy frontend ngoài Docker, chỉnh `VITE_API_URL` trong `.env` nếu API không ở
`http://localhost:8000/api/v1`.

## API chính

Tất cả route nghiệp vụ dùng prefix `/api/v1`.

| Module | Endpoint tiêu biểu |
| --- | --- |
| Auth | `POST /auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password` |
| User | `POST /users`, `GET/PATCH/DELETE /users/me`, `GET /users/{username}` |
| Follow | `POST/DELETE /users/{id}/follow`, `GET /users/{id}/followers`, `/following` |
| Post | `POST/GET /posts`, `GET/PATCH/DELETE /posts/{id}` |
| Reply | `POST/GET /posts/{id}/replies`, `PATCH/DELETE /posts/{id}/replies/{reply_id}` |
| Like | `POST/DELETE/GET /posts/{id}/likes` |
| Repost | `POST/DELETE/GET /posts/{id}/reposts` |
| Bookmark | `POST/DELETE /posts/{id}/bookmarks`, `GET /bookmarks` |
| Media | `POST /media`, `GET/DELETE /media/{id}` |
| AI Assistant | `POST /ai/write`, `/ai/posts/{id}/fact-check`, `/ask`, `/summarize`, `/suggest-reply` |
| Notification | `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all` |
| Search | `GET /search/users?q=...`, `GET /search/posts?q=...` |
| Feed | `GET /feed/home`, `/feed/following`, `/feed/users/{username}`, `/feed/users/{username}/replies`, `/reposts` |
| Report | `POST /reports` |
| Admin | `GET/PATCH /admin/reports`, block/delete post, ban/unban user |

Swagger tại `/docs` là nguồn mô tả đầy đủ request, response, validation và cơ chế Bearer token cho 40
nhóm đường dẫn API.

## Auth và bảo mật

- Mật khẩu được băm bằng Argon2, không lưu plain text.
- Access token sống ngắn; refresh token có `jti`, được lưu trong database, rotate sau mỗi lần refresh và
  revoke khi logout/reset mật khẩu.
- Forgot password luôn trả cùng một thông báo để tránh dò email. Ở `THREADS_DEBUG=true`, reset token được
  trả trong response để phát triển local; production cần nối hook gửi email và để debug là `false`.
- Route admin kiểm tra role ở server; ban/deactivate cũng được kiểm tra tại dependency xác thực.
- Upload giới hạn loại file và kích thước (`THREADS_MAX_UPLOAD_MB`, mặc định 25 MB).

## Kiểm tra ảnh real/fake

Mọi ảnh tải lên qua `POST /api/v1/media` được kiểm tra bằng model
[`dima806/deepfake_vs_real_image_detection`](https://huggingface.co/dima806/deepfake_vs_real_image_detection)
trước khi ghi file và tạo bản ghi media. Ảnh có điểm `Fake` từ ngưỡng cấu hình trở lên sẽ bị từ chối;
frontend hiển thị thông báo lỗi màu đỏ và không cho gắn ảnh đó vào bài đăng. Video không đi qua model ảnh.

- `THREADS_DEEPFAKE_MODEL`: model Hugging Face, mặc định là model trên.
- `THREADS_DEEPFAKE_THRESHOLD`: ngưỡng điểm `Fake`, mặc định `0.5`, hợp lệ từ `0` đến `1`.
- `THREADS_DEEPFAKE_DEVICE`: thiết bị inference, mặc định `cpu`.
- Model được tải lười ở lần upload ảnh đầu tiên và cache trong Docker volume `huggingface_cache`.
  Lần đầu sẽ chậm hơn vì checkpoint khoảng 343 MB cần được tải xuống.

Nếu model không tải được hoặc inference lỗi, API trả `503` và không lưu ảnh. Model card cảnh báo tập dữ liệu
huấn luyện đã cũ so với các công cụ sinh ảnh hiện tại; với môi trường production nên đánh giá lại ngưỡng trên
dữ liệu thực tế và cân nhắc huấn luyện lại model.

## Gemini AI Assistant

AI Assistant là tính năng opt-in theo từng tài khoản và mặc định tắt. Người dùng bật hoặc tắt trong trang
**Cài đặt**. Khi tắt, frontend ẩn các công cụ AI và backend từ chối toàn bộ endpoint AI của tài khoản đó.
Mỗi người dùng nhập Google API key của riêng họ trong **Cài đặt**. Backend mã hóa key trước khi lưu database,
chỉ trả về trạng thái đã/chưa cấu hình và không bao giờ trả lại giá trị key cho frontend. Biến
`THREADS_API_KEY_ENCRYPTION_SECRET` phải được giữ ổn định; nếu không cấu hình, ứng dụng dùng
`THREADS_JWT_SECRET` để dẫn xuất khóa mã hóa.

Model caption ảnh được tải lazy từ Hugging Face ở lần dùng đầu tiên và dùng chung volume cache:

```dotenv
THREADS_GEMINI_MODEL=gemini-2.5-flash
THREADS_FLORENCE_MODEL=florence-community/Florence-2-large
```

Các chức năng:

- Fact-check bài đăng bằng Gemini kết hợp Google Search grounding, kèm nguồn và cảnh báo kết quả chỉ mang
  tính tham khảo.
- Viết lại, sửa chính tả, rút gọn và đổi giọng bài viết ngay trong Composer.
- Hỏi đáp RAG trên nội dung một bài đăng và phản hồi của thread đó.
- Tóm tắt quan điểm đồng thuận, bất đồng và vấn đề còn bỏ ngỏ trong thread.
- Sinh ba gợi ý phản hồi theo các sắc thái khác nhau.
- Gợi ý caption từ ảnh đã tải lên bằng Florence-2-large với pipeline `image-text-to-text`. Ứng dụng dùng
  checkpoint `florence-community/Florence-2-large`, bản native Transformers của Florence-2, để tương thích
  Transformers v5 và không phải thực thi remote code.

Ngữ cảnh RAG được giới hạn bởi `THREADS_AI_MAX_CONTEXT_REPLIES` (mặc định 100) và
`THREADS_AI_MAX_CONTEXT_CHARS` (mặc định 30000). Dữ liệu bài đăng/phản hồi được đánh dấu là nội dung
không tin cậy trong system instruction để giảm rủi ro prompt injection. Nội dung gửi tới AI sẽ được chuyển
đến dịch vụ Google Gemini; giao diện Cài đặt thông báo rõ điều này trước khi người dùng bật tính năng.

## Database

Schema gồm các bảng `users`, `refresh_tokens`, `password_reset_tokens`, `posts`, `replies`, `likes`,
`follows`, `reposts`, `bookmarks`, `media`, `notifications`, `reports`. Foreign key dùng cascade phù hợp;
các quan hệ social có composite primary key để ngăn thao tác trùng.

Tạo migration mới sau khi chỉnh model:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Kiểm thử

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check app tests alembic

cd ..\frontend
npm run build
```

Test hiện bao phủ đăng ký/đăng nhập/refresh/reset mật khẩu, hồ sơ, post, reply, like, repost, bookmark,
feed, follow, notification, kiểm tra ảnh real/fake, report và luồng kiểm duyệt admin.

## Cấu trúc

```text
backend/
  app/                  FastAPI app, models, schema, service và routers
  alembic/              Migration database
  tests/                API integration tests với database cô lập
frontend/
  src/components/       App shell, composer, post, states dùng chung
  src/pages/            Auth, feed, profile, search, activity, settings, admin
docker-compose.yml      Web + API + PostgreSQL
```
