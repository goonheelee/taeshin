#!/usr/bin/env python3
"""
loststolen_ocr.py
-----------------
EasyOCR을 사용하여 캡차 이미지에서 텍스트를 추출하는 스크립트입니다.
명령행 인자로 이미지 파일 경로를 받아 OCR 결과(텍스트)를 출력합니다.
"""

import sys
import easyocr

def main():
    # 명령행 인자에서 이미지 경로 확인
    if len(sys.argv) < 2:
        print("Usage: python loststolen_ocr.py <image_path>")
        return

    image_path = sys.argv[1]
    # EasyOCR 리더 생성 (영어만 사용, GPU 사용 안 함)
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    # 이미지에서 텍스트 추출 (detail=0이면 텍스트만 반환)
    results = reader.readtext(image_path, detail=0)
    if results:
        print(results[0])
    else:
        print("No text recognized")

if __name__ == '__main__':
    main()
