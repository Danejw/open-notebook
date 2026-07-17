import os

# ROOT DATA FOLDER
DATA_FOLDER = "./data"

# LANGGRAPH CHECKPOINT FILE
sqlite_folder = f"{DATA_FOLDER}/sqlite-db"
LANGGRAPH_CHECKPOINT_FILE = (
    os.environ.get("LANGGRAPH_CHECKPOINT_FILE", "").strip()
    or f"{sqlite_folder}/checkpoints.sqlite"
)
checkpoint_folder = os.path.dirname(LANGGRAPH_CHECKPOINT_FILE) or "."
os.makedirs(checkpoint_folder, exist_ok=True)

# UPLOADS FOLDER
UPLOADS_FOLDER = f"{DATA_FOLDER}/uploads"
os.makedirs(UPLOADS_FOLDER, exist_ok=True)

# Architectural drawing extraction outputs (renders, crops) — separate from uploads
DRAWING_EXTRACTION_FOLDER = f"{DATA_FOLDER}/drawing-extractions"
os.makedirs(DRAWING_EXTRACTION_FOLDER, exist_ok=True)

# MEDIA LIBRARY FOLDER (global template images / logos)
MEDIA_FOLDER = f"{DATA_FOLDER}/media"
os.makedirs(MEDIA_FOLDER, exist_ok=True)

# TIKTOKEN CACHE FOLDER
# Reads TIKTOKEN_CACHE_DIR from the environment so Docker can redirect the cache
# to a path outside /data/ (which is typically volume-mounted and would hide the
# pre-baked encoding baked into the image at build time).
TIKTOKEN_CACHE_DIR = os.environ.get("TIKTOKEN_CACHE_DIR", "").strip() or f"{DATA_FOLDER}/tiktoken-cache"
os.makedirs(TIKTOKEN_CACHE_DIR, exist_ok=True)
