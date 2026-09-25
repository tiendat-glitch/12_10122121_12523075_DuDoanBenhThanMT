# AI Models — Dự đoán bệnh thận mạn tính

Thư mục chứa dữ liệu, notebook, mã huấn luyện, artifact và AI Service. Xem [README hệ thống](../README.md).

## Cấu trúc

| Thư mục/file | Vai trò |
|---|---|
| data/dataset.zip, data/DATA.md | Dataset Kaggle nén, nguồn và thông tin giấy phép |
| colab/ | 4 notebook EDA → preprocess → train → evaluate |
| src/ | Mã Python preprocess.py, train.py, evaluate.py |
| models/model.joblib | Pipeline đã fit và Logistic Regression |
| models/schema.json | Hợp đồng 24 đặc trưng |
| models/metadata.json | Model version, metric, ngày huấn luyện, thư viện |
| models/training_results.*, evaluation_results.csv | Kết quả huấn luyện và so sánh |
| models/parameter_plan.json, training_environment.json | Kế hoạch tham số và môi trường train |
| service/app/ | API và cách tính Logistic Regression |
| service/tests/ | Test API, artifact và giải thích dự đoán |
| requirements.txt | Thư viện huấn luyện đã ghim phiên bản |
| service/requirements.txt | Thư viện phục vụ AI và kiểm thử |

## Dữ liệu và pipeline

Nguồn và mô tả nằm tại [DATA.md](data/DATA.md); bảng 24 đặc trưng ở [README gốc](../README.md).
Loại cột id, làm sạch khoảng trắng/nhãn, ép kiểu biến số. Chia train/test trước khi fit.
Numeric: median imputer → StandardScaler. Categorical: mode imputer → OneHotEncoder. Classifier cuối hiện tại là Logistic Regression.
Schema phục vụ validation và form; BE không tự tiền xử lý lại dữ liệu.

## Huấn luyện trên Colab

Mở [Google Colab](https://colab.research.google.com/), upload notebook theo thứ tự:

1. [01_eda.ipynb](colab/01_eda.ipynb): upload dataset.zip; phân tích và xuất hình.
2. [02_preprocess.ipynb](colab/02_preprocess.ipynb): upload dataset.zip; tạo preprocessing/schema.
3. [03_train.ipynb](colab/03_train.ipynb): upload dataset.zip; train baseline và 4 model, tải training_artifacts.zip.
4. [04_evaluate.ipynb](colab/04_evaluate.ipynb): upload dataset.zip và training_artifacts.zip; tải ckd_final_artifacts.zip.

Chạy từ đầu đến cuối, không thay feature/split giữa các bước. Giữ cùng môi trường thư viện khi export và load model.
Đưa model.joblib, schema.json, metadata.json của cùng lần export vào models/. Đồng bộ bảng đánh giá và requirements khi huấn luyện lại.
Các hình EDA/đánh giá lưu ở ../docs/figures/ để dùng trong báo cáo và slide.

## Chạy bằng Docker

Tại **gốc hệ thống**:

```powershell
docker compose up --build -d
docker compose logs -f ai-service
```

AI được build từ thư mục ai-models, dùng service/Dockerfile. Model nạp ngay trong lifespan khi khởi động; thiếu artifact hoặc sai thứ tự feature sẽ không khởi động thành công.
Model được đóng trong image nên phải rebuild sau khi thay artifact.

## API

| Method | Endpoint | Phản hồi |
|---|---|---|
| GET | /health | status, port, uptime_seconds, model_loaded |
| GET | /model-info | Metadata và schema |
| POST | /predict | prediction, probability, model_version, request_id, duration_ms, explanation |
| GET | /docs | Swagger UI |

Body predict: `{"features": {...}}` với đủ trường theo schema. Probability là xác suất **ckd**.
Dữ liệu sai trả 400. Request ID được giữ từ header X-Request-ID; nếu thiếu sẽ tạo mới. Log không chứa đặc trưng đầu vào.

## Xem cách tính

explanation.py lấy giá trị sau transform, hệ số và intercept từ pipeline thật. Hệ số được quy về lớp CKD:

```text
contribution_i = transformed_value_i × coefficient_i
z = intercept + sum(contribution_i)
P(CKD) = 1 / (1 + exp(-z))
```

Đóng góp nằm trên thang log-odds, không phải phần trăm hoặc quan hệ nhân quả. Model khác Logistic Regression nhị phân trả available=false.

## Kiểm thử trên host

Cần Python 3.13. Từ gốc hệ thống, trong venv:

```powershell
python -m pip install -r ai-models/service/requirements.txt
python -m pytest -q ai-models/service/tests
```

Test nạp model thật, validation, request ID và kiểm tra tổng đóng góp khớp xác suất cho cả hai lớp.
