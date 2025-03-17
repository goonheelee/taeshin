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

# Python 패키지 컴파일에 필요한 빌드 도구 설치
RUN apt-get update && apt-get install -y build-essential

# Python3 및 pip 설치
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

# pip 업그레이드 (시스템 제한 우회를 위해 --break-system-packages 추가)
RUN pip3 install --upgrade pip --break-system-packages

# 안정적인 NumPy 1.x 버전 설치 (NumPy 2.x와의 호환성 문제 해결)
RUN pip3 install numpy==1.24.3 --break-system-packages

# CPU 버전의 torch와 torchvision 설치 (버전을 명시하고 --break-system-packages 추가)
RUN pip3 install torch==2.0.1 torchvision==0.15.2 --extra-index-url https://download.pytorch.org/whl/cpu --break-system-packages

# easyocr 설치
RUN pip3 install easyocr --break-system-packages

# python 명령어를 python3로 연결 (혹시 코드 어딘가 python을 호출하는 경우 대비)
RUN ln -s /usr/bin/python3 /usr/bin/python

USER node

WORKDIR /app

# package.json과 package-lock.json 복사
COPY --chown=node package.json .
COPY --chown=node package-lock.json .

# Puppeteer가 Docker에서 설치된 Chromium을 사용하도록 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# Node.js 의존성 설치
RUN npm install

# 프로젝트의 나머지 파일 복사
COPY --chown=node . /app

# 컨테이너 시작 시 "npm start"로 애플리케이션 실행 (package.json의 start 스크립트가 node server.js로 정의되어 있다고 가정)
CMD ["npm", "start"]
