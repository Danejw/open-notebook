from pathlib import Path

for path in Path("frontend/src/lib/locales").glob("*/index.ts"):
    text = path.read_text(encoding="utf-8")
    fixed = text.replace('tools: \\"Tools\\",', 'tools: "Tools",')
    if fixed != text:
        path.write_text(fixed, encoding="utf-8")
        print("fixed", path)
