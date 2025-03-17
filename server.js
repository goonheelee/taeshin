/*****************************************************
 * 필요한 Node.js 모듈 로드
 *****************************************************/
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

// Puppeteer-extra와 Stealth 플러그인 로드 및 설정
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

/*****************************************************
 * 앱 기본 설정
 *****************************************************/
const app = express();
const PORT = process.env.PORT || 5500; // 포트 번호 (환경 변수 PORT가 있으면 사용, 없으면 5500)

// 간단한 인증 미들웨어 (필요에 따라 실제 로그인/세션 검사 로직을 추가하세요)
function isAuthenticated(req, res, next) {
  next();
}

// body-parser 미들웨어 설정: POST 요청 시 body 파싱
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 정적 파일 제공 (public 폴더 내의 HTML, CSS, 클라이언트 JS 등)
app.use(express.static('public'));

/*****************************************************
 * Nodemailer 예시 - /send-email 엔드포인트
 * 이메일 전송 기능 예제
 *****************************************************/
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  
  // 이메일 발송을 위한 설정 (실제 계정/비밀번호로 수정하세요)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'lgh9293@gmail.com',   // 발신자 Gmail 계정
      pass: 'rwatzbdnylowldzv'       // 앱 비밀번호
    }
  });
  
  const mailOptions = {
    from: email,
    to: 'tax@taeshintrade.com',
    subject: `${name}님의 태신무역 홈페이지에서의 메일발송`,
    text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
  };
  
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send('Error sending email');
    } else {
      console.log('Email sent:', info.response);
      return res.redirect('/');
    }
  });
});

/*****************************************************
 * 제품 정보 조회 API - /api/productInfo
 * https://imeicheck.com/imei-tac-database-info/에서 제품명, 브랜드, 모델 추출
 *****************************************************/
app.get('/api/productInfo', isAuthenticated, async (req, res) => {
  const imei = req.query.imei;
  if (!imei || imei.length !== 15 || isNaN(imei)) {
    return res.status(400).json({ error: "IMEI가 15자리가 아닙니다. 확인해주세요." });
  }
  try {
    const productInfo = await extractProductInfo(imei);
    if (!productInfo) {
      return res.status(400).json({ error: "정상적인 제품 정보를 조회할 수 없습니다." });
    }
    res.json(productInfo);
  } catch (error) {
    console.error("제품 정보 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

/*****************************************************
 * 분실/도난 정보 조회 API - /api/lostInfo
 * https://www.imei.kr/user/inquire/lostInquireFree.do에서 캡차 OCR 포함하여 분실/도난 정보 추출
 *****************************************************/
app.get('/api/lostInfo', isAuthenticated, async (req, res) => {
  const imei = req.query.imei;
  if (!imei || imei.length !== 15 || isNaN(imei)) {
    return res.status(400).json({ error: "IMEI가 15자리가 아닙니다. 확인해주세요." });
  }
  try {
    const lostInfo = await extractLostStolenInfo(imei);
    if (!lostInfo) {
      return res.status(400).json({ error: "분실/도난 정보를 조회할 수 없습니다." });
    }
    res.json({ loststolen: lostInfo });
  } catch (error) {
    console.error("분실/도난 정보 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

/*****************************************************
 * 제품 정보 추출 함수 (imeicheck.com)
 * 최대 5회 재시도 로직 포함
 *****************************************************/
async function extractProductInfo(imei) {
  let attempts = 0;
  let result = null;
  while (attempts < 1 && !result) {
    attempts++;
    try {
      result = await (async () => {
        // Docker 환경에서 Puppeteer가 설치한 Chromium을 사용하기 위한 옵션
        const browser = await puppeteerExtra.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        const page = await browser.newPage();
        
        // Cloudflare 인증 정보가 있다면 (환경변수 CF_USERNAME, CF_PASSWORD) HTTP Basic Auth 적용
        if (process.env.CF_USERNAME && process.env.CF_PASSWORD) {
          await page.authenticate({
            username: process.env.CF_USERNAME,
            password: process.env.CF_PASSWORD
          });
        }
        
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        );
        await page.goto('https://imeicheck.com/imei-tac-database-info/', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await page.waitForSelector('#imei', { timeout: 30000 });
        
        // IMEI 입력 필드를 초기화하고 값을 입력
        await page.evaluate(() => {
          const input = document.getElementById('imei');
          if (input) input.value = '';
        });
        await page.evaluate((imei) => {
          document.querySelector('#imei').value = imei;
        }, imei);
        
        await page.waitForSelector('button.btn-search', { timeout: 30000 });
        await page.click('button.btn-search');
        await page.waitForSelector('h2.swal2-title', { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 결과 텍스트 추출
        const text = await page.$eval('h2.swal2-title', el => el.innerText);
        await browser.close();
        
        // 결과 텍스트를 파싱하여 브랜드, 모델, 모델명을 추출
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        let brand = '', model = '', modelName = '';
        lines.forEach(line => {
          if (line.startsWith('Brand:')) {
            brand = line.replace('Brand:', '').trim();
          } else if (line.startsWith('Model:')) {
            model = line.replace('Model:', '').trim();
          } else if (line.startsWith('Model Name:')) {
            modelName = line.replace('Model Name:', '').trim();
          }
        });
        if (brand && model && modelName) {
          return { productName: modelName, brand, model };
        } else {
          throw new Error('제품 정보가 완전히 추출되지 않았습니다.');
        }
      })();
    } catch (e) {
      console.error(`extractProductInfo 시도 ${attempts}회 실패:`, e.message);
      result = null;
    }
  }
  return result;
}

/*****************************************************
 * 분실/도난 정보 추출 함수 (imei.kr)
 * 최대 5회 재시도 로직 포함 (캡차 이미지 OCR 포함)
 *****************************************************/
async function extractLostStolenInfo(imei) {
  let attempts = 0;
  let lostInfo = null;
  while (attempts < 1 && !lostInfo) {
    attempts++;
    try {
      lostInfo = await (async () => {
        const browser = await puppeteerExtra.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });
        const page = await browser.newPage();
        
        // Cloudflare 인증 정보 적용 (HTTP Basic Auth)
        if (process.env.CF_USERNAME && process.env.CF_PASSWORD) {
          await page.authenticate({
            username: process.env.CF_USERNAME,
            password: process.env.CF_PASSWORD
          });
        }
        
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        );
        await page.goto('https://www.imei.kr/user/inquire/lostInquireFree.do', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await page.waitForSelector('#captchaImg', { timeout: 15000 });
        const captchaPath = 'captcha_loststolen.png';
        const captchaElement = await page.$('#captchaImg');
        if (!captchaElement) throw new Error("캡차 이미지 요소를 찾을 수 없습니다.");
        await captchaElement.screenshot({ path: captchaPath });
        console.log('캡차 이미지 캡쳐 완료:', captchaPath);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Python OCR 스크립트 호출하여 캡차 텍스트 추출 (필요에 따라 "python3"로 수정)
        const ocrText = await new Promise((resolve, reject) => {
          exec(`python loststolen_ocr.py ${captchaPath}`, (error, stdout, stderr) => {
            if (error) {
              console.error(`Python OCR 실행 에러: ${error.message}`);
              return reject(error);
            }
            resolve(stdout.trim());
          });
        });
        console.log('OCR 결과:', ocrText);
        if (!/^\d{6}$/.test(ocrText)) {
          throw new Error("OCR 결과가 6자리 숫자가 아닙니다.");
        }

        // 약관 동의 체크 및 값 입력
        await page.waitForSelector('#chkAgree', { timeout: 10000 });
        await page.click('#chkAgree');
        await page.evaluate((imei) => {
          document.querySelector('#imei').value = imei;
        }, imei);
        await page.evaluate((ocrText) => {
          document.querySelector('#captcha').value = ocrText;
        }, ocrText);
        await page.waitForSelector('a.btn.type4', { timeout: 10000 });
        await page.click('a.btn.type4');

        // 결과 모달 대기 및 최대 5회 재시도
        await page.waitForSelector('#resultStr, #resultStr2', { timeout: 15000 });
        let resultText = "";
        let resultAttempt = 0;
        while (resultText === "" && resultAttempt < 5) {
          resultAttempt++;
          if (await page.$('#resultStr')) {
            resultText = await page.evaluate(() => document.querySelector('#resultStr').textContent);
          } else if (await page.$('#resultStr2')) {
            resultText = await page.evaluate(() => document.querySelector('#resultStr2').textContent);
          }
          resultText = resultText.trim();
          if (resultText !== "") break;
          console.log(`분실/도난 정보가 비어있습니다. 재시도 중... (${resultAttempt}/5)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (resultText === "") {
          throw new Error("분실/도난 정보를 5회 재시도해도 가져오지 못했습니다.");
        }
        if (resultText.includes("보안문자를 확인하세요")) {
          throw new Error("캡차 오류로 인해 재시도합니다.");
        }
        await browser.close();
        return resultText;
      })();
    } catch (e) {
      console.error(`extractLostStolenInfo 시도 ${attempts}회 실패:`, e.message);
      lostInfo = null;
    }
  }
  return lostInfo;
}

/*****************************************************
 * 서버 실행
 *****************************************************/
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
