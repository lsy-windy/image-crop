# Image Crop Workspace

정적(HTML/CSS/JS) 기반 이미지 크롭 페이지입니다.

## 로컬 실행

1. 파일 바로 열기
   - `index.html` 더블 클릭
2. 로컬 서버 실행(권장)
   - `py -3 -m http.server 5500`
   - 브라우저: `http://localhost:5500`

## Docker 실행

1. 이미지 빌드
   - `docker build -t image-crop-workspace .`
2. 컨테이너 실행
   - `docker run -d -p 8881:80 --name image-crop-workspace image-crop-workspace`
3. 접속
   - `http://localhost:8881`

## Docker Compose 실행

1. 실행
   - `docker compose up -d --build`
2. 접속
   - `http://localhost:8881`

## 주요 파일

- `Dockerfile`
- `docker-compose.yml`
- `dist/index.html`
- `dist/src/styles/main.css`
- `dist/src/scripts/main.js`
