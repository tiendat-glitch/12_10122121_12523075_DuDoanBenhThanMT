# Dataset

## Nguồn

- Tên: Chronic Kidney Disease (Kidney Disease)
- Nguồn: [Kaggle Chronic Kidney Disease](https://www.kaggle.com/datasets/mansoordaku/ckdisease).
- Nguồn gốc được Kaggle ghi nhận: [UCI Chronic Kidney Disease](https://archive.ics.uci.edu/ml/datasets/Chronic_Kidney_Disease).
- File sử dụng trong notebook: `dataset.zip`, chứa `kidney_disease.csv`.
- Kích thước kiểm tra: 400 dòng, 26 cột.
- Biến mục tiêu: `classification` với hai nhãn sau chuẩn hóa: `ckd`, `notckd`.

## Sử dụng

Các notebook đọc trực tiếp CSV bên trong ZIP bằng `zipfile.ZipFile`; không cần giải nén thủ công. Không dùng cột `id` để huấn luyện.

## Giấy phép và trách nhiệm

Kaggle hiện hiển thị giấy phép là **Unknown**. Nhóm cần giữ lại URL nguồn và kiểm tra điều kiện sử dụng trước khi public repo. Không đưa credential Kaggle hoặc file `kaggle.json` vào Git.
