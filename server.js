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
const PORT = process.env.PORT || 5500; // 환경 변수 PORT가 없으면 5500 사용

// 간단한 인증 미들웨어 (필요시 실제 인증 로직 추가)
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
 *****************************************************/
app.post('/send-email', (req, res) => {
  const { name, email, message } = req.body;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'lgh9293@gmail.com', // 실제 계정으로 수정
      pass: 'rwatzbdnylowldzv'    // 실제 앱 비밀번호로 수정
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
 *****************************************************/
async function extractProductInfo(imei) {
  let attempts = 0;
  let result = null;
  while (attempts < 5 && !result) {
    attempts++;
    let browser;
    try {
      browser = await puppeteerExtra.launch({
        headless: true, // 창을 열지 않음
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      const page = await browser.newPage();
      
      // Cloudflare 기본 인증이 필요한 경우 환경변수 CF_USERNAME, CF_PASSWORD 사용
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
      
      // IMEI 입력 필드 초기화 및 값 입력
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
      
      const text = await page.$eval('h2.swal2-title', el => el.innerText);
      
      // 결과 파싱
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
        result = { productName: modelName, brand, model };
      } else {
        throw new Error('제품 정보가 완전히 추출되지 않았습니다.');
      }
    } catch (e) {
      console.error(`extractProductInfo 시도 ${attempts}회 실패:`, e.message);
      result = null;
    } finally {
      if (browser) await browser.close();
    }
  }
  return result;
}

/*****************************************************
 * 분실/도난 정보 추출 함수 (imei.kr)
 *****************************************************/
async function extractLostStolenInfo(imei) {
  let attempts = 0;
  let lostInfo = null;
  while (attempts < 5 && !lostInfo) {
    attempts++;
    let browser;
    try {
      // Puppeteer를 headless 모드로 실행 (창을 표시하지 않음)
      browser = await puppeteerExtra.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      const page = await browser.newPage();
      
      // Cloudflare 기본 인증 (필요한 경우 환경변수 사용)
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
      
      // 페이지 접속
      await page.goto('https://www.imei.kr/user/inquire/lostInquireFree.do', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await page.waitForSelector('#captchaImg', { timeout: 15000 });
      
      // 캡차 이미지 스크린샷 저장
      const captchaPath = 'captcha_loststolen.png';
      const captchaElement = await page.$('#captchaImg');
      if (!captchaElement) throw new Error("캡차 이미지 요소를 찾을 수 없습니다.");
      await captchaElement.screenshot({ path: captchaPath });
      console.log('캡차 이미지 캡쳐 완료:', captchaPath);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 파이썬 OCR 스크립트 호출 (python3 사용)
      const ocrText = await new Promise((resolve, reject) => {
        exec(`python3 loststolen_ocr.py ${captchaPath}`, (error, stdout, stderr) => {
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
      
      // 약관 동의 및 폼 값 입력
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
      
      // 버튼 클릭 후 페이지 결과가 로드될 시간을 위해 3초 대기
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 결과 추출 재시도 로직 (최대 5회)
      await page.waitForSelector('#resultStr, #resultStr2', { timeout: 15000 });
      let resultText = "";
      let resultAttempt = 0;
      while (resultText === "" && resultAttempt < 5) {
        resultAttempt++;
        let tempText = "";
        const resultStrElem = await page.$('#resultStr');
        if (resultStrElem) {
          tempText = await page.evaluate(el => el.innerText, resultStrElem);
          console.log("Extracted text from #resultStr:", tempText);
        }
        if (!tempText) {
          const resultStr2Elem = await page.$('#resultStr2');
          if (resultStr2Elem) {
            tempText = await page.evaluate(el => el.innerText, resultStr2Elem);
            console.log("Extracted text from #resultStr2:", tempText);
          }
        }
        resultText = tempText.trim().replace(/\n/g, ' ');
        console.log(`Processed text in attempt ${resultAttempt}:`, resultText);
        if (resultText !== "") break;
        console.log(`분실/도난 정보가 비어있습니다. 재시도 중... (${resultAttempt}/5)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      if (resultText === "") {
        throw new Error("분실/도난 정보를 5회 재시도해도 가져오지 못했습니다.");
      }
      if (resultText.includes("보안문자를 확인하세요")) {
        throw new Error("캡차 오류로 인해 재시도합니다.");
      }
      
      lostInfo = resultText;
    } catch (e) {
      console.error(`extractLostStolenInfo 시도 ${attempts}회 실패:`, e.message);
      lostInfo = null;
    } finally {
      if (browser) await browser.close();
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
