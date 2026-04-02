# Image Crop Workspace

정적(HTML/CSS/JS) 기반 이미지 크롭 작업 페이지입니다.

배포 및 실행 기준 파일은 `dist/` 폴더입니다.

## 로컬 실행

1. `dist` 폴더 기준 정적 서버 실행
   - `py -3 -m http.server 5500 -d dist`
2. 브라우저 접속
   - `http://localhost:5500`

## GitHub Pages 배포

- `.github/workflows/deploy-pages.yml` 이 `main` 브랜치 push 시 `dist/` 폴더를 GitHub Pages로 배포합니다.

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
