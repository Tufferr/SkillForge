import os
import sys
import json
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import db
except ImportError:
    from backend import db

PORT = 5173

if getattr(sys, 'frozen', False):
    base_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    FRONTEND_DIR = os.path.join(base_dir, "frontend")
else:
    FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

class SkillForgeHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if not path:
            path = ""

        # API Routes
        if path.startswith("/api"):
            try:
                query_params = parse_qs(parsed.query)
                board_id = query_params.get("board_id", [None])[0]

                if path == "/api/boards":
                    boards = db.get_boards()
                    self.send_json(200, boards)
                elif path == "/api/backup/export":
                    backup = db.export_full_database()
                    self.send_json(200, backup)
                elif path == "/api/skills":
                    data = db.get_all_skills(board_id)
                    self.send_json(200, data)
                elif path.startswith("/api/skills/"):
                    skill_id = path[len("/api/skills/"):]
                    skill = db.get_skill_detail(skill_id)
                    if skill:
                        self.send_json(200, skill)
                    else:
                        self.send_json(404, {"error": "Skill not found"})
                elif path == "/api/categories":
                    categories = db.get_categories_and_stats(board_id)
                    self.send_json(200, categories)
                elif path == "/api/settings":
                    settings = db.get_all_settings()
                    self.send_json(200, settings)
                elif path == "/api/health":
                    self.send_json(200, {"status": "ok", "app": "SkillForge"})
                else:
                    self.send_json(404, {"error": "API route not found"})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        # Static File Serving
        rel_path = parsed.path.lstrip("/")
        if not rel_path:
            rel_path = "index.html"

        file_path = os.path.abspath(os.path.join(FRONTEND_DIR, rel_path))

        # Security check: must remain within FRONTEND_DIR
        if not file_path.startswith(FRONTEND_DIR) or not os.path.exists(file_path) or os.path.isdir(file_path):
            # Fallback to index.html for SPA routing
            file_path = os.path.join(FRONTEND_DIR, "index.html")

        if os.path.exists(file_path) and not os.path.isdir(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if mime_type is None:
                mime_type = "application/octet-stream"

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(os.path.getsize(file_path)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            with open(file_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        body = self.read_json_body()

        try:
            if path == "/api/boards":
                res = db.create_board(body)
                self.send_json(201, res)
            elif path == "/api/skills":
                res = db.create_skill(body)
                self.send_json(201, res)
            elif path == "/api/skills/batch-delete":
                ids = body.get("ids", [])
                db.batch_delete_skills(ids)
                self.send_json(200, {"success": True, "count": len(ids)})
            elif path == "/api/skills/positions":
                positions = body.get("positions", {})
                db.update_skill_positions(positions)
                self.send_json(200, {"success": True, "count": len(positions)})
            elif path == "/api/skills/positions/reset":
                board_id = body.get("board_id")
                db.reset_skill_positions(board_id)
                self.send_json(200, {"success": True})
            elif path == "/api/skills/batch-create":
                names = body.get("names", [])
                cat_id = body.get("category_id")
                status = body.get("status", "want_to_learn")
                priority = body.get("priority", "medium")
                tier = body.get("proficiency_tier", "novice")
                created_ids = db.batch_create_skills(names, cat_id, status, priority, tier)
                self.send_json(201, {"success": True, "created_count": len(created_ids)})
            elif path.startswith("/api/milestones/") and path.endswith("/toggle"):
                parts = path.split("/")
                m_id = parts[3]
                res = db.toggle_milestone(m_id)
                if res:
                    self.send_json(200, res)
                else:
                    self.send_json(404, {"error": "Milestone not found"})
            elif path.startswith("/api/skills/") and path.endswith("/milestones"):
                parts = path.split("/")
                s_id = parts[3]
                title = body.get("title", "New Milestone")
                res = db.add_milestone(s_id, title)
                self.send_json(201, res)
            elif path.startswith("/api/skills/") and path.endswith("/practice"):
                parts = path.split("/")
                s_id = parts[3]
                mins = body.get("duration_minutes", 30)
                notes = body.get("session_notes", "")
                res = db.add_practice_log(s_id, mins, notes)
                self.send_json(201, res)
            elif path.startswith("/api/skills/") and path.endswith("/set-time"):
                parts = path.split("/")
                s_id = parts[3]
                mins = body.get("total_minutes", 0)
                res = db.set_skill_time_spent(s_id, mins)
                self.send_json(200, res)
            elif path.startswith("/api/skills/") and path.endswith("/reset-time"):
                parts = path.split("/")
                s_id = parts[3]
                res = db.set_skill_time_spent(s_id, 0)
                self.send_json(200, res)
            elif path == "/api/skills/reset-all-times":
                b_id = body.get("board_id")
                db.reset_all_preset_times(b_id)
                self.send_json(200, {"success": True})
            elif path.startswith("/api/skills/") and path.endswith("/resources"):
                parts = path.split("/")
                s_id = parts[3]
                title = body.get("title", "New Resource")
                url = body.get("url", "")
                rtype = body.get("type", "article")
                rstatus = body.get("status", "to_consume")
                res = db.add_resource(s_id, title, url, rtype, rstatus)
                self.send_json(201, res)
            elif path == "/api/dependencies":
                prereq_id = body.get("prerequisite_id")
                dep_id = body.get("dependent_id")
                req_type = body.get("requirement_type", "hard_prerequisite")
                if prereq_id and dep_id:
                    db.add_dependency(prereq_id, dep_id, req_type)
                    self.send_json(201, {"success": True})
                else:
                    self.send_json(400, {"error": "Missing dependency IDs"})
            elif path == "/api/backup/import":
                backup_data = body.get("data", body)
                mode = body.get("mode", "merge")
                summary = db.import_full_database(backup_data, mode)
                self.send_json(200, {"success": True, "summary": summary})
            elif path == "/api/settings":
                if "key" in body and "value" in body:
                    db.set_setting(body["key"], body["value"])
                else:
                    for k, v in body.items():
                        db.set_setting(k, v)
                self.send_json(200, {"success": True, "settings": db.get_all_settings()})
            else:
                self.send_json(404, {"error": "Endpoint not found"})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        body = self.read_json_body()

        try:
            if path.startswith("/api/skills/"):
                skill_id = path[len("/api/skills/"):]
                res = db.update_skill(skill_id, body)
                if res:
                    self.send_json(200, res)
                else:
                    self.send_json(404, {"error": "Skill not found"})
            else:
                self.send_json(404, {"error": "Endpoint not found"})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        try:
            if path.startswith("/api/boards/"):
                b_id = path[len("/api/boards/"):]
                db.delete_board(b_id)
                self.send_json(200, {"success": True})
            elif path.startswith("/api/skills/"):
                skill_id = path[len("/api/skills/"):]
                db.delete_skill(skill_id)
                self.send_json(200, {"success": True})
            elif path.startswith("/api/milestones/"):
                m_id = path[len("/api/milestones/"):]
                res = db.delete_milestone(m_id)
                self.send_json(200, res)
            elif path.startswith("/api/resources/"):
                r_id = path[len("/api/resources/"):]
                res = db.delete_resource(r_id)
                self.send_json(200, res)
            elif path.startswith("/api/dependencies/"):
                d_id = path[len("/api/dependencies/"):]
                db.delete_dependency(d_id)
                self.send_json(200, {"success": True})
            elif path.startswith("/api/practice/"):
                p_id = path[len("/api/practice/"):]
                res = db.delete_practice_log(p_id)
                if res:
                    self.send_json(200, res)
                else:
                    self.send_json(404, {"error": "Practice log not found"})
            else:
                self.send_json(404, {"error": "Endpoint not found"})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

def run():
    db.init_db()
    server_address = ("127.0.0.1", PORT)
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(server_address, SkillForgeHandler)
    print(f"SkillForge Server running at http://127.0.0.1:{PORT}", flush=True)
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    run()
