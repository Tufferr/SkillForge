import sqlite3
import json
import uuid
from datetime import datetime, timezone
import os
import sys
import shutil

def get_db_path():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA')
        if appdata:
            target_dir = os.path.join(appdata, 'SkillForge')
        else:
            target_dir = os.path.dirname(sys.executable)
        os.makedirs(target_dir, exist_ok=True)
        target_db = os.path.join(target_dir, "skills.db")
        if not os.path.exists(target_db):
            bundled_db = os.path.join(getattr(sys, '_MEIPASS', ''), "backend", "skills.db")
            if os.path.exists(bundled_db):
                try:
                    shutil.copy2(bundled_db, target_db)
                except Exception:
                    pass
        return target_db
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "skills.db")

DB_PATH = get_db_path()

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        board_id TEXT DEFAULT 'board-tech',
        name TEXT NOT NULL,
        description TEXT,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        target_weight INTEGER DEFAULT 5,
        FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category_id TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        status TEXT NOT NULL CHECK(status IN ('want_to_learn', 'in_progress', 'mastered', 'dormant')),
        priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        proficiency_tier TEXT NOT NULL CHECK(proficiency_tier IN ('novice', 'beginner', 'competent', 'proficient', 'master')),
        progress_pct INTEGER DEFAULT 0,
        tracking_mode TEXT DEFAULT 'milestones' CHECK(tracking_mode IN ('milestones', 'hours_logged', 'manual')),
        target_hours INTEGER DEFAULT 20,
        total_time_spent INTEGER DEFAULT 0,
        target_completion_date TEXT,
        last_practiced_at TEXT,
        notes_content TEXT,
        pos_x REAL,
        pos_y REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skill_dependencies (
        id TEXT PRIMARY KEY,
        prerequisite_id TEXT NOT NULL,
        dependent_id TEXT NOT NULL,
        requirement_type TEXT DEFAULT 'hard_prerequisite' CHECK(requirement_type IN ('hard_prerequisite', 'recommended', 'sub_skill')),
        FOREIGN KEY (prerequisite_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (dependent_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE(prerequisite_id, dependent_id)
    );

    CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        title TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT,
        order_index INTEGER DEFAULT 0,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_logs (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        session_notes TEXT,
        logged_at TEXT NOT NULL,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        type TEXT DEFAULT 'article' CHECK(type IN ('book', 'course', 'documentation', 'video', 'article')),
        status TEXT DEFAULT 'to_consume' CHECK(status IN ('to_consume', 'in_progress', 'completed')),
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS proof_of_work (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        description TEXT,
        completed_at TEXT,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Default settings
    cursor.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'dark')")

    # Migration: check if board_id exists in categories
    cursor.execute("PRAGMA table_info(categories)")
    cols = [r["name"] for r in cursor.fetchall()]
    if "board_id" not in cols:
        cursor.execute("ALTER TABLE categories ADD COLUMN board_id TEXT DEFAULT 'board-tech'")

    # Migration: check if pos_x, pos_y exist in skills
    cursor.execute("PRAGMA table_info(skills)")
    skill_cols = [r["name"] for r in cursor.fetchall()]
    if "pos_x" not in skill_cols:
        cursor.execute("ALTER TABLE skills ADD COLUMN pos_x REAL")
    if "pos_y" not in skill_cols:
        cursor.execute("ALTER TABLE skills ADD COLUMN pos_y REAL")

    conn.commit()

    # Seed boards and data
    seed_boards_and_domains(conn)
    conn.close()

def seed_boards_and_domains(conn):
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Seed Boards
    boards = [
        ("board-tech", "Tech & Software", "💻", "Programming, web frameworks, databases, and DevOps", now),
        ("board-fitness", "Fitness & Health", "🏋️‍♂️", "Strength, conditioning, mobility, nutrition, and wellness", now),
        ("board-life", "Life Skills & Mindset", "🌟", "Personal finance, public speaking, cooking, and productivity", now),
    ]

    for b in boards:
        cursor.execute("""
        INSERT OR IGNORE INTO boards (id, name, icon, description, created_at)
        VALUES (?, ?, ?, ?, ?)
        """, b)

    # Ensure Tech categories have board-tech
    cursor.execute("UPDATE categories SET board_id = 'board-tech' WHERE board_id IS NULL OR board_id = ''")

    # Check if Fitness categories exist
    cursor.execute("SELECT COUNT(*) as count FROM categories WHERE board_id = 'board-fitness'")
    if cursor.fetchone()["count"] == 0:
        seed_fitness_board(cursor, now)

    # Check if Life Skills categories exist
    cursor.execute("SELECT COUNT(*) as count FROM categories WHERE board_id = 'board-life'")
    if cursor.fetchone()["count"] == 0:
        seed_life_board(cursor, now)

    conn.commit()

def seed_fitness_board(cursor, now):
    categories = [
        ("cat-fit-strength", "board-fitness", "Strength & Hypertrophy", "Progressive overload, compound lifts, and muscle building", "#ef4444", "Dumbbell", 9),
        ("cat-fit-cardio", "board-fitness", "Cardio & Conditioning", "Aerobic capacity, Zone 2 base, and sprint intervals", "#f97316", "Activity", 7),
        ("cat-fit-mobility", "board-fitness", "Mobility & Recovery", "Flexibility, joint longevity, and prehab routines", "#10b981", "Zap", 8),
        ("cat-fit-nutrition", "board-fitness", "Nutrition & Fuel", "Macronutrient tracking, meal prep, and hydration", "#84cc16", "Apple", 8),
        ("cat-fit-sleep", "board-fitness", "Sleep & Wellness", "Sleep architecture, recovery tracking, and stress regulation", "#06b6d4", "Moon", 9),
    ]
    cursor.executemany("""
    INSERT OR IGNORE INTO categories (id, board_id, name, description, color, icon, target_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, categories)

    skills = [
        ("sk-fit-pushup", "Push-up Progression", "cat-fit-strength", "💪", "#ef4444", "mastered", "high", "proficient", 90, "milestones", 20, 900, "2025-10-01", now, "Solid form: strict elbow tuck, full range scapular protraction.", now, now),
        ("sk-fit-bench", "Barbell Bench Press", "cat-fit-strength", "🏋️‍♂️", "#ef4444", "in_progress", "urgent", "competent", 65, "milestones", 40, 1100, "2026-06-01", now, "Working toward 1.25x bodyweight working sets. Focus on leg drive.", now, now),
        ("sk-fit-ohp", "Overhead Press", "cat-fit-strength", "🏋️", "#ef4444", "in_progress", "medium", "beginner", 40, "milestones", 30, 450, "2026-08-01", now, "Strict standing press with solid core bracing.", now, now),
        ("sk-fit-squat", "Barbell Back Squat", "cat-fit-strength", "🦵", "#dc2626", "in_progress", "urgent", "competent", 70, "milestones", 50, 1400, "2026-07-01", now, "Deep squat depth below parallel. Solid brace with valsalva maneuver.", now, now),
        ("sk-fit-deadlift", "Romanian Deadlift", "cat-fit-strength", "🪵", "#b91c1c", "in_progress", "high", "competent", 60, "milestones", 35, 750, "2026-08-15", now, "Posterior chain hypertrophy: hip hinge without lumbar rounding.", now, now),
        
        ("sk-fit-zone2", "Zone 2 Aerobic Running", "cat-fit-cardio", "🏃‍♂️", "#f97316", "mastered", "high", "proficient", 85, "milestones", 40, 1600, "2025-12-01", now, "Nasal breathing pace at 130-140 bpm heart rate for 45+ mins.", now, now),
        ("sk-fit-5k", "Sub-22m 5K Sprint", "cat-fit-cardio", "⏱️", "#ea580c", "want_to_learn", "medium", "novice", 20, "milestones", 30, 120, "2026-10-01", None, "Interval pacing and lactate threshold intervals.", now, now),

        ("sk-fit-mobility", "Daily 15m Hip & Shoulder Routine", "cat-fit-mobility", "🧘‍♂️", "#10b981", "mastered", "high", "master", 95, "milestones", 20, 1200, "2025-09-01", now, "World's greatest stretch, 90/90 hip flow, shoulder dislocations.", now, now),
        ("sk-fit-splits", "Pancake & Hamstring Mobility", "cat-fit-mobility", "🤸", "#059669", "want_to_learn", "medium", "beginner", 30, "milestones", 30, 180, "2026-11-01", None, "End-range loaded stretching for hamstrings and adductors.", now, now),

        ("sk-fit-protein", "Daily Protein Tracking (1.8g/kg)", "cat-fit-nutrition", "🥩", "#84cc16", "mastered", "high", "master", 95, "milestones", 15, 800, "2025-08-01", now, "Consistent lean protein distribution across 4 meals.", now, now),
        ("sk-fit-mealprep", "Sunday Bulk Meal Prep", "cat-fit-nutrition", "🥗", "#65a30d", "in_progress", "high", "competent", 75, "milestones", 20, 600, "2026-05-01", now, "Batch cooking complex carbs, seasoned poultry, and greens in 90 mins.", now, now),

        ("sk-fit-sleep", "Sleep Hygiene & Consistency", "cat-fit-sleep", "💤", "#06b6d4", "in_progress", "urgent", "competent", 70, "milestones", 30, 500, "2026-06-30", now, "No blue light 1h before bed, cool room (18C), consistent wakeup time.", now, now),
    ]

    cursor.executemany("""
    INSERT OR IGNORE INTO skills (id, name, category_id, icon, color, status, priority, proficiency_tier, progress_pct, tracking_mode, target_hours, total_time_spent, target_completion_date, last_practiced_at, notes_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, skills)

    dependencies = [
        ("dep-fit-1", "sk-fit-pushup", "sk-fit-bench", "hard_prerequisite"),
        ("dep-fit-2", "sk-fit-bench", "sk-fit-ohp", "recommended"),
        ("dep-fit-3", "sk-fit-squat", "sk-fit-deadlift", "recommended"),
        ("dep-fit-4", "sk-fit-zone2", "sk-fit-5k", "hard_prerequisite"),
        ("dep-fit-5", "sk-fit-mobility", "sk-fit-splits", "hard_prerequisite"),
        ("dep-fit-6", "sk-fit-protein", "sk-fit-mealprep", "hard_prerequisite"),
        ("dep-fit-7", "sk-fit-bench", "sk-fit-deadlift", "recommended"),
    ]

    cursor.executemany("""
    INSERT OR IGNORE INTO skill_dependencies (id, prerequisite_id, dependent_id, requirement_type)
    VALUES (?, ?, ?, ?)
    """, dependencies)

def seed_life_board(cursor, now):
    categories = [
        ("cat-life-culinary", "board-life", "Culinary & Gastronomy", "Knife techniques, flavor profiles, sautéing, mother sauces, and baking", "#f59e0b", "Flame", 8),
        ("cat-life-music", "board-life", "Music & Audio Craft", "Music theory, instrument proficiency, chords, and ear training", "#06b6d4", "Music", 8),
        ("cat-life-finance", "board-life", "Personal Finance & Wealth", "Budgeting, index investing, tax planning, and cash flow", "#10b981", "Coins", 9),
        ("cat-life-speaking", "board-life", "Communication & Influence", "Storytelling, persuasion, public speaking, and negotiation", "#3b82f6", "MessageSquare", 8),
        ("cat-life-habits", "board-life", "Productivity & Focus", "Time blocking, deep work, daily systems, and energy audits", "#8b5cf6", "Clock", 8),
        ("cat-life-diy", "board-life", "Practical DIY & Crafts", "Hand tools, home repairs, electrical soldering, and fixture maintenance", "#64748b", "Wrench", 7),
        ("cat-life-mindset", "board-life", "Mindset & Resilience", "Stoicism, meditation, emotional intelligence, and cognitive biases", "#ec4899", "Heart", 8),
    ]

    cursor.executemany("""
    INSERT OR IGNORE INTO categories (id, board_id, name, description, color, icon, target_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, categories)

    skills = [
        # Finance
        ("sk-life-budget", "Zero-Based Budgeting", "cat-life-finance", "💰", "#10b981", "mastered", "high", "master", 95, "milestones", 15, 600, "2025-07-01", now, "Tracking every dollar with envelope system. Maintaining 6-month emergency reserve.", now, now),
        ("sk-life-invest", "Index Funds & DCA Investing", "cat-life-finance", "📈", "#059669", "in_progress", "urgent", "competent", 80, "milestones", 25, 800, "2026-05-15", now, "Automated monthly contributions into low-cost total market index funds.", now, now),
        ("sk-life-tax", "Tax Strategy & Optimization", "cat-life-finance", "🛡️", "#047857", "want_to_learn", "medium", "beginner", 25, "milestones", 30, 150, "2026-11-01", None, "Maxing out tax-advantaged accounts (401k/IRA/HSA).", now, now),

        # Communication
        ("sk-life-listen", "Active Empathetic Listening", "cat-life-speaking", "👂", "#3b82f6", "mastered", "high", "proficient", 85, "milestones", 20, 500, "2025-10-01", now, "Reflective paraphrasing, non-judgmental cues, and validating emotions.", now, now),
        ("sk-life-story", "Business & Personal Storytelling", "cat-life-speaking", "🗣️", "#2563eb", "in_progress", "high", "competent", 65, "milestones", 30, 450, "2026-07-01", now, "Using Pixar narrative arcs and hook-retain-payoff frameworks.", now, now),
        ("sk-life-public", "Keynote Public Speaking", "cat-life-speaking", "🎤", "#1d4ed8", "want_to_learn", "high", "novice", 15, "milestones", 40, 90, "2026-12-01", None, "Stage pacing, vocal modulation, and slide minimalism.", now, now),

        # Habits
        ("sk-life-timeblock", "Time Blocking & Calendar Defense", "cat-life-habits", "📅", "#8b5cf6", "mastered", "high", "master", 95, "milestones", 20, 700, "2025-08-01", now, "Batching shallow admin work and safeguarding morning deep focus.", now, now),
        ("sk-life-deepwork", "Deep Work (4h Focus Blocks)", "cat-life-habits", "🧠", "#7c3aed", "in_progress", "urgent", "competent", 75, "milestones", 35, 950, "2026-06-01", now, "Zero notifications, phone in another room, state flow rituals.", now, now),

        # Culinary
        ("sk-life-knife", "Chef Knife Skills & Mise en Place", "cat-life-culinary", "🔪", "#f59e0b", "mastered", "medium", "proficient", 90, "milestones", 20, 600, "2025-11-01", now, "Claw grip technique, fine julienne, brunoise, and sharpening on whetstone.", now, now),
        ("sk-life-pan", "Pan Sautéing & Heat Control", "cat-life-culinary", "🍳", "#d97706", "in_progress", "high", "competent", 65, "milestones", 30, 400, "2026-07-15", now, "Fond creation, deglazing with wine/stock, pan sauces with butter finish.", now, now),
        ("sk-life-sauces", "The 5 French Mother Sauces", "cat-life-culinary", "🥣", "#b45309", "want_to_learn", "medium", "novice", 20, "milestones", 25, 120, "2026-10-01", None, "Béchamel, Velouté, Espagnole, Hollandaise, and classic Tomato.", now, now),
        ("sk-life-bread", "Sourdough & Dough Fermentation", "cat-life-culinary", "🍞", "#92400e", "want_to_learn", "medium", "beginner", 30, "milestones", 30, 180, "2026-11-15", None, "Wild yeast starter hydration, stretch-and-fold techniques, and Dutch oven baking.", now, now),
        ("sk-life-flavor", "Flavor Balancing: Salt, Fat, Acid, Heat", "cat-life-culinary", "🧂", "#d97706", "in_progress", "high", "competent", 70, "milestones", 20, 350, "2026-08-20", now, "Using acid (citrus/vinegar) and fat to calibrate dish profile.", now, now),

        # Music & Audio Craft
        ("sk-life-theory", "Music Theory Fundamentals", "cat-life-music", "🎼", "#0891b2", "mastered", "high", "proficient", 85, "milestones", 25, 600, "2025-12-01", now, "Rhythm, staff notation, clefs, key signatures, and the circle of fifths.", now, now),
        ("sk-life-scales", "Major & Minor Scales & Intervals", "cat-life-music", "🎹", "#0284c7", "in_progress", "urgent", "competent", 75, "milestones", 30, 500, "2026-06-15", now, "Diatonic major/minor scales and pentatonic finger shapes across 2 octaves.", now, now),
        ("sk-life-chords", "Chord Progressions & Harmony", "cat-life-music", "🎸", "#0369a1", "in_progress", "high", "competent", 60, "milestones", 35, 420, "2026-07-30", now, "Triads, barre chords, 7th chords, and common chord progressions (I-V-vi-IV).", now, now),
        ("sk-life-ear", "Ear Training & Transcription", "cat-life-music", "🎧", "#0e7490", "want_to_learn", "medium", "novice", 20, "milestones", 30, 100, "2026-10-20", None, "Identifying melodic intervals, chord qualities (maj/min), and transcribing by ear.", now, now),
        ("sk-life-improv", "Musical Improvisation & Soloing", "cat-life-music", "🎷", "#155e75", "want_to_learn", "medium", "beginner", 25, "milestones", 40, 150, "2026-12-01", None, "Targeting chord tones and phrasing solos over backing rhythm tracks.", now, now),

        # Practical DIY & Crafts
        ("sk-life-tools", "Essential Hand Tools & Safety", "cat-life-diy", "🔨", "#475569", "mastered", "high", "master", 95, "milestones", 15, 500, "2025-06-01", now, "Proper drill, impact driver, levels, measuring tapes, and eye/ear safety.", now, now),
        ("sk-life-drywall", "Drywall Patching & Paint Finish", "cat-life-diy", "🧱", "#334155", "in_progress", "medium", "competent", 70, "milestones", 20, 300, "2026-08-01", now, "Spanning mesh tape, feathering joint compound, and rolling matching sheen.", now, now),
        ("sk-life-plumbing", "Plumbing Fixtures & Leak Diagnostics", "cat-life-diy", "🔧", "#1e293b", "want_to_learn", "high", "beginner", 35, "milestones", 25, 180, "2026-09-15", None, "P-trap clearing, shutoff valve replacement, and Teflon tape sealing.", now, now),
        ("sk-life-soldering", "Electronics & Wire Soldering", "cat-life-diy", "⚡", "#0f172a", "want_to_learn", "medium", "novice", 15, "milestones", 20, 80, "2026-11-01", None, "Tinning wires, heat shrink insulation, and through-hole soldering.", now, now),

        # Mindset
        ("sk-life-stoic", "Stoic Journaling & Cognitive Reframing", "cat-life-mindset", "🏛️", "#ec4899", "in_progress", "high", "competent", 70, "milestones", 25, 550, "2026-08-01", now, "Dichotomy of control, Amor Fati, and morning premeditatio malorum.", now, now),
    ]

    cursor.executemany("""
    INSERT OR IGNORE INTO skills (id, name, category_id, icon, color, status, priority, proficiency_tier, progress_pct, tracking_mode, target_hours, total_time_spent, target_completion_date, last_practiced_at, notes_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, skills)

    dependencies = [
        # Finance
        ("dep-life-1", "sk-life-budget", "sk-life-invest", "hard_prerequisite"),
        ("dep-life-2", "sk-life-invest", "sk-life-tax", "hard_prerequisite"),
        # Communication
        ("dep-life-3", "sk-life-listen", "sk-life-story", "hard_prerequisite"),
        ("dep-life-4", "sk-life-story", "sk-life-public", "hard_prerequisite"),
        # Habits
        ("dep-life-5", "sk-life-timeblock", "sk-life-deepwork", "hard_prerequisite"),
        # Culinary
        ("dep-life-6", "sk-life-knife", "sk-life-pan", "hard_prerequisite"),
        ("dep-life-7", "sk-life-pan", "sk-life-sauces", "hard_prerequisite"),
        ("dep-life-8", "sk-life-pan", "sk-life-bread", "recommended"),
        ("dep-life-9", "sk-life-sauces", "sk-life-flavor", "hard_prerequisite"),
        # Music
        ("dep-life-10", "sk-life-theory", "sk-life-scales", "hard_prerequisite"),
        ("dep-life-11", "sk-life-scales", "sk-life-chords", "hard_prerequisite"),
        ("dep-life-12", "sk-life-chords", "sk-life-improv", "hard_prerequisite"),
        ("dep-life-13", "sk-life-theory", "sk-life-ear", "recommended"),
        # DIY
        ("dep-life-14", "sk-life-tools", "sk-life-drywall", "hard_prerequisite"),
        ("dep-life-15", "sk-life-drywall", "sk-life-plumbing", "recommended"),
        ("dep-life-16", "sk-life-tools", "sk-life-soldering", "recommended"),
    ]

    cursor.executemany("""
    INSERT OR IGNORE INTO skill_dependencies (id, prerequisite_id, dependent_id, requirement_type)
    VALUES (?, ?, ?, ?)
    """, dependencies)

# Query functions
def get_boards():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT b.*,
           (SELECT COUNT(*) FROM categories c WHERE c.board_id = b.id) as category_count,
           (SELECT COUNT(*) FROM skills s JOIN categories c ON s.category_id = c.id WHERE c.board_id = b.id) as skill_count
    FROM boards b
    ORDER BY b.created_at ASC
    """)
    boards = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return boards

def create_board(data):
    conn = get_connection()
    cursor = conn.cursor()
    b_id = f"board-{uuid.uuid4().hex[:6]}"
    now = datetime.now(timezone.utc).isoformat()
    name = data.get("name", "Custom Board")
    icon = data.get("icon", "📋")
    desc = data.get("description", "")

    cursor.execute("""
    INSERT INTO boards (id, name, icon, description, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, (b_id, name, icon, desc, now))

    # Create an initial foundational category
    cat_id = f"cat-{uuid.uuid4().hex[:6]}"
    cat_name = data.get("initial_category", "Core Fundamentals")
    cursor.execute("""
    INSERT INTO categories (id, board_id, name, description, color, icon, target_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (cat_id, b_id, cat_name, "Foundational skills and core competencies", "#6366f1", "Target", 8))

    conn.commit()
    conn.close()
    return {"id": b_id, "name": name, "icon": icon, "description": desc, "category_id": cat_id}

def delete_board(board_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    conn.commit()
    conn.close()
    return True

def get_all_skills(board_id=None):
    conn = get_connection()
    cursor = conn.cursor()

    if board_id and board_id != "all":
        cursor.execute("""
        SELECT s.*, c.name as category_name, c.color as category_color, c.icon as category_icon, c.board_id,
               (SELECT COUNT(*) FROM milestones m WHERE m.skill_id = s.id) as total_milestones,
               (SELECT COUNT(*) FROM milestones m WHERE m.skill_id = s.id AND m.is_completed = 1) as completed_milestones
        FROM skills s
        JOIN categories c ON s.category_id = c.id
        WHERE c.board_id = ?
        ORDER BY s.updated_at DESC
        """, (board_id,))
    else:
        cursor.execute("""
        SELECT s.*, c.name as category_name, c.color as category_color, c.icon as category_icon, c.board_id,
               (SELECT COUNT(*) FROM milestones m WHERE m.skill_id = s.id) as total_milestones,
               (SELECT COUNT(*) FROM milestones m WHERE m.skill_id = s.id AND m.is_completed = 1) as completed_milestones
        FROM skills s
        JOIN categories c ON s.category_id = c.id
        ORDER BY s.updated_at DESC
        """)

    skills = [dict(row) for row in cursor.fetchall()]
    skill_id_set = {s["id"] for s in skills}

    cursor.execute("""
    SELECT d.*, p.name as prerequisite_name, dep.name as dependent_name
    FROM skill_dependencies d
    JOIN skills p ON d.prerequisite_id = p.id
    JOIN skills dep ON d.dependent_id = dep.id
    """)
    all_deps = [dict(row) for row in cursor.fetchall()]

    # Filter dependencies to only include skills present in this board
    dependencies = [d for d in all_deps if d["prerequisite_id"] in skill_id_set and d["dependent_id"] in skill_id_set]

    dep_map_prereqs = {}
    dep_map_unlocks = {}
    for d in dependencies:
        dep_map_prereqs.setdefault(d["dependent_id"], []).append(d)
        dep_map_unlocks.setdefault(d["prerequisite_id"], []).append(d)

    for s in skills:
        s["prerequisites"] = dep_map_prereqs.get(s["id"], [])
        s["unlocks"] = dep_map_unlocks.get(s["id"], [])

    conn.close()
    return {"skills": skills, "dependencies": dependencies}

def get_skill_detail(skill_id):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT s.*, c.name as category_name, c.color as category_color, c.icon as category_icon, c.board_id
    FROM skills s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
    """, (skill_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    skill = dict(row)

    cursor.execute("SELECT * FROM milestones WHERE skill_id = ? ORDER BY order_index ASC", (skill_id,))
    skill["milestones"] = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM practice_logs WHERE skill_id = ? ORDER BY logged_at DESC", (skill_id,))
    skill["practice_logs"] = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM resources WHERE skill_id = ? ORDER BY id DESC", (skill_id,))
    skill["resources"] = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM proof_of_work WHERE skill_id = ? ORDER BY completed_at DESC", (skill_id,))
    skill["proof_of_work"] = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT d.*, s.name as prerequisite_name, s.proficiency_tier, s.status
    FROM skill_dependencies d
    JOIN skills s ON d.prerequisite_id = s.id
    WHERE d.dependent_id = ?
    """, (skill_id,))
    skill["prerequisites"] = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
    SELECT d.*, s.name as dependent_name, s.proficiency_tier, s.status
    FROM skill_dependencies d
    JOIN skills s ON d.dependent_id = s.id
    WHERE d.prerequisite_id = ?
    """, (skill_id,))
    skill["unlocks"] = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return skill

def get_categories_and_stats(board_id=None):
    conn = get_connection()
    cursor = conn.cursor()

    if board_id and board_id != "all":
        cursor.execute("SELECT * FROM categories WHERE board_id = ? ORDER BY name ASC", (board_id,))
    else:
        cursor.execute("SELECT * FROM categories ORDER BY name ASC")

    categories = [dict(r) for r in cursor.fetchall()]

    tier_scores = {
        "novice": 20,
        "beginner": 40,
        "competent": 65,
        "proficient": 85,
        "master": 100
    }

    cursor.execute("SELECT category_id, proficiency_tier, progress_pct FROM skills")
    skills_cat = cursor.fetchall()

    cat_stats = {c["id"]: {"score_sum": 0, "skills": 0} for c in categories}

    for sc in skills_cat:
        cid = sc["category_id"]
        if cid in cat_stats:
            score = tier_scores.get(sc["proficiency_tier"], 20)
            blended = (score * 0.7) + (sc["progress_pct"] * 0.3)
            cat_stats[cid]["score_sum"] += blended
            cat_stats[cid]["skills"] += 1

    for c in categories:
        cid = c["id"]
        count = cat_stats[cid]["skills"]
        c["avg_score"] = round(cat_stats[cid]["score_sum"] / count) if count > 0 else 0
        c["skill_count"] = count

    conn.close()
    return categories

def create_skill(data):
    conn = get_connection()
    cursor = conn.cursor()
    new_id = f"sk-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
    INSERT INTO skills (
        id, name, category_id, icon, color, status, priority,
        proficiency_tier, progress_pct, tracking_mode, target_hours,
        total_time_spent, target_completion_date, notes_content, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        new_id,
        data.get("name", "Untitled Skill"),
        data.get("category_id"),
        data.get("icon", "🎯"),
        data.get("color", "#6366f1"),
        data.get("status", "want_to_learn"),
        data.get("priority", "medium"),
        data.get("proficiency_tier", "novice"),
        int(data.get("progress_pct", 0)),
        data.get("tracking_mode", "milestones"),
        int(data.get("target_hours", 20)),
        0,
        data.get("target_completion_date"),
        data.get("notes_content", ""),
        now, now
    ))
    conn.commit()
    conn.close()
    return get_skill_detail(new_id)

def update_skill(skill_id, data):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    fields = [
        "name", "category_id", "icon", "color", "status", "priority",
        "proficiency_tier", "progress_pct", "tracking_mode", "target_hours",
        "target_completion_date", "notes_content", "pos_x", "pos_y", "total_time_spent"
    ]
    updates = []
    values = []
    for f in fields:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])

    if updates:
        updates.append("updated_at = ?")
        values.append(now)
        values.append(skill_id)
        cursor.execute(f"UPDATE skills SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return get_skill_detail(skill_id)

def update_skill_positions(positions):
    """
    positions: dict of { skill_id: {'x': float, 'y': float} }
    """
    if not positions:
        return True
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    for s_id, pos in positions.items():
        if isinstance(pos, dict):
            cursor.execute("UPDATE skills SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?", (pos.get("x"), pos.get("y"), now, s_id))
    conn.commit()
    conn.close()
    return True

def reset_skill_positions(board_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    if board_id and board_id != "all":
        cursor.execute("""
            UPDATE skills SET pos_x = NULL, pos_y = NULL, updated_at = ?
            WHERE category_id IN (SELECT id FROM categories WHERE board_id = ?)
        """, (now, board_id))
    else:
        cursor.execute("UPDATE skills SET pos_x = NULL, pos_y = NULL, updated_at = ?", (now,))
    conn.commit()
    conn.close()
    return True

def delete_skill(skill_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM skills WHERE id = ?", (skill_id,))
    conn.commit()
    conn.close()
    return True

def batch_delete_skills(skill_ids):
    if not skill_ids:
        return True
    conn = get_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in skill_ids)
    cursor.execute(f"DELETE FROM skills WHERE id IN ({placeholders})", skill_ids)
    conn.commit()
    conn.close()
    return True

def batch_create_skills(skill_names, category_id, status="want_to_learn", priority="medium", tier="novice", icon="🎯"):
    if not skill_names or not category_id:
        return []
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    created_ids = []

    for name in skill_names:
        clean_name = name.strip()
        if not clean_name:
            continue
        new_id = f"sk-{uuid.uuid4().hex[:8]}"
        cursor.execute("""
        INSERT INTO skills (
            id, name, category_id, icon, color, status, priority,
            proficiency_tier, progress_pct, tracking_mode, target_hours,
            total_time_spent, notes_content, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, clean_name, category_id, icon, "#6366f1",
            status, priority, tier, 0, "milestones", 20, 0, "", now, now
        ))
        created_ids.append(new_id)

    conn.commit()
    conn.close()
    return created_ids

def toggle_milestone(milestone_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_completed, skill_id FROM milestones WHERE id = ?", (milestone_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    new_status = 0 if row["is_completed"] == 1 else 1
    completed_at = datetime.now(timezone.utc).isoformat() if new_status == 1 else None

    cursor.execute("""
    UPDATE milestones SET is_completed = ?, completed_at = ? WHERE id = ?
    """, (new_status, completed_at, milestone_id))

    skill_id = row["skill_id"]
    cursor.execute("SELECT COUNT(*) as total, SUM(is_completed) as done FROM milestones WHERE skill_id = ?", (skill_id,))
    m_stat = cursor.fetchone()
    if m_stat["total"] > 0:
        new_pct = round((m_stat["done"] / m_stat["total"]) * 100)
        cursor.execute("UPDATE skills SET progress_pct = ? WHERE id = ? AND tracking_mode = 'milestones'", (new_pct, skill_id))

    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def add_milestone(skill_id, title):
    conn = get_connection()
    cursor = conn.cursor()
    new_id = f"m-{uuid.uuid4().hex[:8]}"
    cursor.execute("SELECT COALESCE(MAX(order_index), 0) + 1 as next_idx FROM milestones WHERE skill_id = ?", (skill_id,))
    idx = cursor.fetchone()["next_idx"]

    cursor.execute("""
    INSERT INTO milestones (id, skill_id, title, is_completed, order_index)
    VALUES (?, ?, ?, 0, ?)
    """, (new_id, skill_id, title, idx))
    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def delete_milestone(milestone_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT skill_id FROM milestones WHERE id = ?", (milestone_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    skill_id = row["skill_id"]

    cursor.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))
    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def add_practice_log(skill_id, duration_minutes, session_notes=""):
    conn = get_connection()
    cursor = conn.cursor()
    new_id = f"log-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    mins = int(duration_minutes)

    cursor.execute("""
    INSERT INTO practice_logs (id, skill_id, duration_minutes, session_notes, logged_at)
    VALUES (?, ?, ?, ?, ?)
    """, (new_id, skill_id, mins, session_notes, now))

    cursor.execute("""
    UPDATE skills 
    SET total_time_spent = MAX(0, total_time_spent + ?),
        last_practiced_at = ?,
        updated_at = ?
    WHERE id = ?
    """, (mins, now, now, skill_id))

    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def delete_practice_log(log_id):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("SELECT skill_id, duration_minutes FROM practice_logs WHERE id = ?", (log_id,))
    row = cursor.fetchone()
    if row:
        skill_id = row["skill_id"]
        mins = row["duration_minutes"]
        cursor.execute("DELETE FROM practice_logs WHERE id = ?", (log_id,))
        cursor.execute("""
        UPDATE skills 
        SET total_time_spent = MAX(0, total_time_spent - ?),
            updated_at = ?
        WHERE id = ?
        """, (mins, now, skill_id))
        conn.commit()
        conn.close()
        return get_skill_detail(skill_id)
    conn.close()
    return None

def set_skill_time_spent(skill_id, total_minutes):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    mins = max(0, int(total_minutes))

    cursor.execute("""
    UPDATE skills 
    SET total_time_spent = ?,
        updated_at = ?
    WHERE id = ?
    """, (mins, now, skill_id))

    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def reset_all_preset_times(board_id=None):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    if board_id and board_id != "all":
        cursor.execute("""
            UPDATE skills 
            SET total_time_spent = 0, updated_at = ?
            WHERE category_id IN (SELECT id FROM categories WHERE board_id = ?)
        """, (now, board_id))
        cursor.execute("""
            DELETE FROM practice_logs 
            WHERE skill_id IN (SELECT id FROM skills WHERE category_id IN (SELECT id FROM categories WHERE board_id = ?))
        """, (board_id,))
    else:
        cursor.execute("UPDATE skills SET total_time_spent = 0, updated_at = ?", (now,))
        cursor.execute("DELETE FROM practice_logs")

    conn.commit()
    conn.close()
    return True

def add_resource(skill_id, title, url, res_type, status):
    conn = get_connection()
    cursor = conn.cursor()
    new_id = f"res-{uuid.uuid4().hex[:8]}"

    cursor.execute("""
    INSERT INTO resources (id, skill_id, title, url, type, status)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (new_id, skill_id, title, url, res_type, status))
    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def delete_resource(resource_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT skill_id FROM resources WHERE id = ?", (resource_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    skill_id = row["skill_id"]
    cursor.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
    conn.commit()
    conn.close()
    return get_skill_detail(skill_id)

def add_dependency(prereq_id, dep_id, req_type):
    conn = get_connection()
    cursor = conn.cursor()
    new_id = f"dep-{uuid.uuid4().hex[:8]}"
    try:
        cursor.execute("""
        INSERT INTO skill_dependencies (id, prerequisite_id, dependent_id, requirement_type)
        VALUES (?, ?, ?, ?)
        """, (new_id, prereq_id, dep_id, req_type))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    conn.close()
    return True

def delete_dependency(dependency_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM skill_dependencies WHERE id = ?", (dependency_id,))
    conn.commit()
    conn.close()
    return True

def get_setting(key, default=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key, value):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()
    return True

def get_all_settings():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM app_settings")
    rows = cursor.fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

def export_full_database():
    """
    Exports the entire database schema & records into a portable, versioned JSON dictionary.
    """
    conn = get_connection()
    cursor = conn.cursor()

    tables = [
        "boards",
        "categories",
        "skills",
        "skill_dependencies",
        "milestones",
        "practice_logs",
        "resources",
        "proof_of_work",
        "app_settings"
    ]

    export_data = {
        "app": "SkillForge",
        "version": "1.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "tables": {}
    }

    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            export_data["tables"][table] = [dict(row) for row in cursor.fetchall()]
        except sqlite3.OperationalError:
            export_data["tables"][table] = []

    conn.close()
    return export_data

def import_full_database(data, mode="merge"):
    """
    Imports database records from a backup object.
    mode: 'overwrite' (replaces all tables) or 'merge' (upserts records without deleting non-conflicting items)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Extract tables dict (supports both {tables: {...}} and flat {...} backup structures)
    tables_data = data.get("tables", data)
    if not isinstance(tables_data, dict):
        raise ValueError("Invalid backup format: root must be a JSON object.")

    known_tables = [
        "boards",
        "categories",
        "skills",
        "skill_dependencies",
        "milestones",
        "practice_logs",
        "resources",
        "proof_of_work",
        "app_settings"
    ]

    # Verify at least one valid table exists
    if not any(k in tables_data for k in known_tables):
        raise ValueError("No recognizable SkillForge tables found in backup file.")

    summary = {
        "mode": mode,
        "boards": 0,
        "categories": 0,
        "skills": 0,
        "skill_dependencies": 0,
        "milestones": 0,
        "practice_logs": 0,
        "resources": 0,
        "proof_of_work": 0,
        "app_settings": 0
    }

    try:
        # Disable foreign keys during import to allow clean table wiping and insertion
        cursor.execute("PRAGMA foreign_keys = OFF;")

        if mode == "overwrite":
            for tbl in reversed(known_tables):
                try:
                    cursor.execute(f"DELETE FROM {tbl}")
                except sqlite3.OperationalError:
                    pass

        # Insert tables in relational order
        insert_order = [
            "boards",
            "categories",
            "skills",
            "skill_dependencies",
            "milestones",
            "practice_logs",
            "resources",
            "proof_of_work",
            "app_settings"
        ]

        for tbl in insert_order:
            rows = tables_data.get(tbl, [])
            if not isinstance(rows, list) or not rows:
                continue

            for row in rows:
                if not isinstance(row, dict) or not row:
                    continue

                cols = list(row.keys())
                placeholders = ", ".join(["?"] * len(cols))
                col_names = ", ".join([f'"{c}"' for c in cols])
                vals = [row[c] for c in cols]

                query = f"""
                INSERT OR REPLACE INTO {tbl} ({col_names})
                VALUES ({placeholders})
                """
                cursor.execute(query, vals)
                summary[tbl] += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.close()

    return summary
