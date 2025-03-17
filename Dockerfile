# Node.js 18 공식 이미지를 베이스로 사용
FROM node:18

# Puppeteer(Chromium) 실행에 필요한 시스템 라이브러리 및 폰트 설치
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Python3 및 pip 설치 (OCR 스크립트 사용을 위해)
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
# easyocr 패키지 설치 (OCR 스크립트에서 사용)
RUN pip3 install easyocr

# 비루트 사용자 "node"로 전환 (기본 이미지에 포함됨)
USER node

# 작업 디렉토리를 /app으로 설정
WORKDIR /app

# package.json과 package-lock.json 파일을 복사 (소유자 설정 포함)
COPY --chown=node package.json .
COPY --chown=node package-lock.json .

# Puppeteer가 자동 Chromium 다운로드를 건너뛰고, Docker에서 설치된 Chromium을 사용하도록 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# Node.js 의존성 설치
RUN npm install

# 나머지 애플리케이션 코드 복사
COPY --chown=node . /app

# 컨테이너 시작 시 npm start로 애플리케이션 실행
CMD ["npm", "start"]
