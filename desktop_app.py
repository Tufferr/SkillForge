import os
import sys

# Hardware acceleration & smooth scrolling flags for Microsoft Edge WebView2 on Windows
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    "--enable-smooth-scrolling "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--high-dpi-support=1 "
    "--disable-features=CalculateNativeWinOcclusion"
)

import threading
import time
import urllib.request
import webview


# Ensure local directories are in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(current_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend import server

def run_backend_server():
    server.run()

def wait_for_server(port=5173, max_seconds=6):
    start = time.time()
    url = f"http://127.0.0.1:{port}/api/health"
    while time.time() - start < max_seconds:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False

def main():
    # 1. Start the HTTP and SQLite backend on a background thread
    server_thread = threading.Thread(target=run_backend_server, daemon=True)
    server_thread.start()

    # 2. Wait until server responds before popping up the window
    wait_for_server(port=5173, max_seconds=6)

    # 3. Launch native desktop window (uses Microsoft Edge WebView2 on Windows)
    window = webview.create_window(
        title="SkillForge - Personal Skill Graph & Mastery OS",
        url="http://127.0.0.1:5173",
        width=1340,
        height=880,
        min_size=(960, 640),
        text_select=True,
        zoomable=True
    )

    # Persistent storage path for WebView2 so LocalStorage and caches survive app exits
    appdata = os.environ.get('APPDATA')
    if appdata:
        storage_dir = os.path.join(appdata, 'SkillForge', 'webview_data')
    else:
        storage_dir = os.path.join(current_dir, 'webview_data')
    os.makedirs(storage_dir, exist_ok=True)

    icon_path = os.path.join(current_dir, "app_icon.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    webview.start(private_mode=False, storage_path=storage_dir, icon=icon_path)

if __name__ == "__main__":
    main()
