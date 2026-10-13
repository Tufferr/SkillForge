# SkillForge — Personal Skill Tree & Mastery OS

A local-first, database-backed personal skill tracker combining an **RPG Tech Tree**, **Domain Radar / Spider Chart**, **Kanban Board**, and **Notion-Style Deep Detail Pages**.

---

## 🌟 Features

1. **🌳 Interactive RPG Tech Tree**
   - Visual dependency graph showing parent/prerequisite skills and unlocks with curved SVG bezier connectors.
   - Flow-based layout: Foundational roots flow into advanced specializations.
   - Pan and zoom support, status glow indicators, and 1-click drill-down.

2. **🕸️ Multi-Axis Domain Spider Chart**
   - Dynamic 6-axis polygon radar chart showing your competency profile across domains (Frontend, Backend, DevOps, Data, Architecture, Soft Skills).
   - Real-time aggregation combining proficiency tiers, milestone completion, and logged hours.
   - Target weight thresholds for calibrating learning goals.

3. **📋 Notion-Style Kanban Board**
   - Four lifecycle columns:
     - 🎯 **Want to Learn** (Backlog)
     - ⚡ **In Progress** (Active Sprint)
     - 👑 **Mastered** (Proficient / Retained)
     - 💤 **Dormant** (On Hold)
   - Real-time filtering by category, search keywords, and 1-click column transitions.

4. **📝 Notion-Style Deep Detail Drawer**
   - **Properties**: Icon, Domain, Status, Proficiency Tier (Novice $\rightarrow$ Master), Priority, Progress Bar.
   - **Milestones Roadmap**: Interactive checklist where checking items dynamically updates progress % in SQLite.
   - **Practice Journal**: Micro-logger tracking duration, notes, and session history (with hour aggregation).
   - **Prerequisites & Unlocks**: Add/remove prerequisite links to alter the tech tree dynamically.
   - **Markdown Notes**: Rich cheatsheets and notes saved directly to the database.

---

## 🛠️ Architecture

* **Database**: Local SQLite 3 (`backend/skills.db`) with full relational constraints (`ON DELETE CASCADE`, foreign keys).
* **Backend**: Multi-threaded Python HTTP REST API (`backend/server.py`) with zero third-party pip dependencies.
* **Frontend**: Vanilla ES6 SPA (`frontend/index.html`, `frontend/app.js`) styled with modern Tailwind CSS and Lucide icons.

---

---

## 🚀 How to Run

### Method 1: Standalone Desktop PC Application (.exe)
Double-click the standalone Windows executable:
```
dist\SkillForge.exe
```
* **No browser, node, or terminal needed**: Launches in a sleek, native Edge WebView2 window.
* **Database Persistence**: User data is safely persisted at `%APPDATA%\SkillForge\skills.db`.
* **Rebuilding the `.exe`**: If you make any modifications, simply double-click `build_exe.bat` to re-compile.

### Method 2: Native Desktop Launcher (Python Webview)
```bash
python desktop_app.py
```

### Method 3: Browser Mode (Development)
Double-click `run.bat` or run:
```powershell
.\run.ps1
```
Or manually:
```bash
python backend/server.py
```
Then open: **`http://127.0.0.1:5173`**

---

## 🎨 Advanced Features

* **Multi-Board Ecosystem**: Switch between **Tech Architecture**, **Physical Mastery & Fitness**, and **Life Skills & Practical Craft** (with dedicated pillars for Culinary Arts, Music Theory, Personal Finance, and Home Craft) — or create your own **Custom Boards**.
* **Visual Theme Engine**: Switch between Dark Mode, Clean Light, Slate Gray, Sunset Horizon, Forest Grove, Cyberpunk Neon, and Royal Amethyst.
* **Batch Delete & Quick Management**: Select multiple skills across categories and delete them at once.
* **Custom Icons & SVG Uploads**: Built-in visual icon picker with instant suggestions plus custom image/SVG upload support.
* **Full Data Backup & Restore**: One-click JSON backup export and import to migrate or sync your skill graph across machines.

