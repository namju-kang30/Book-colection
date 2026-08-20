#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
진로 맞춤형 차시별 독서 활동 일지 로컬 실행 서버 (Windows 호환)
"""
import http.server
import socketserver
import webbrowser
import os
import sys
import socket

# Windows 콘솔 인코딩 호환성 보장
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CANDIDATE_PORTS = [8000, 8080, 5000, 5173, 3000, 8888, 3001, 8001]
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 브라우저 캐시 방지 (개발 및 즉시 반영)
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

def find_available_server():
    # 1. 후보 포트 순차 바인딩 시도 (127.0.0.1 및 0.0.0.0)
    for host in ['127.0.0.1', '']:
        for port in CANDIDATE_PORTS:
            try:
                server = socketserver.TCPServer((host, port), CustomHTTPHandler)
                return server, port, host
            except OSError:
                # 10013(권한 거부), 10048(포트 점유) 등 모든 소켓 에러 시 다음 포트 시도
                continue

    # 2. 임의의 빈 포트(0번) 자동 할당 시도
    try:
        server = socketserver.TCPServer(('127.0.0.1', 0), CustomHTTPHandler)
        assigned_port = server.server_address[1]
        return server, assigned_port, '127.0.0.1'
    except Exception as e:
        raise RuntimeError(f"가용 포트를 찾을 수 없습니다: {e}")

def main():
    os.chdir(DIRECTORY)
    try:
        httpd, port, host = find_available_server()
    except Exception as e:
        print("=" * 60)
        print(f"[오류] 서버 실행 실패: {e}")
        print("=" * 60)
        input("엔터 키를 누르면 종료합니다...")
        return

    url = f"http://localhost:{port}"
    print("=" * 62, flush=True)
    print("  [진로 독서 일지 플랫폼] 로컬 웹 서버가 성공적으로 실행되었습니다!", flush=True)
    print(f"  - 접속 URL: {url}", flush=True)
    print(f"  - 실행 위치: {DIRECTORY}", flush=True)
    print("  - 종료 방법: 이 창에서 Ctrl + C 를 누르세요.", flush=True)
    print("=" * 62, flush=True)

    # 기본 브라우저 자동 실행
    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 안전하게 종료합니다.")
    finally:
        try:
            httpd.server_close()
        except Exception:
            pass

if __name__ == "__main__":
    main()
