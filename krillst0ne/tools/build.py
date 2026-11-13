#!/usr/bin/env python3
"""Build krillst0ne dive files.

  build.py SRC_DIR OUT_DIR      text sources (NNN.txt) -> OUT_DIR/N.dat
  build.py --decode FILE.dat    print a built dive back as source text

Source format, seven prompts per file:
  # Name a cocktail. | food
  100: Answer|alias
  85: Answer; Answer|alias; ...
  (tiers 60, 30, 15, 10 the same way; a tier may span several lines)
  note Answer: one line shown with that answer
A .dat file is the dive's JSON, base64-encoded and reversed, so a casual look does not spoil the day.
"""
import sys, os, re, json, base64, unicodedata
TIERS = ["10", "15", "30", "60", "85", "100"]
GENRES = {"food","places","nature","sports","screen","music","brands","words","body","life","history","science"}
def norm(s):
    s = unicodedata.normalize("NFD", s.lower()); s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("&", " and "); s = re.sub(r"['’.]", "", s); s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"^(the|a|an) ", "", s)
def parse(path):
    out, cur, errs = [], None, []
    for ln, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.strip()
        if not line: continue
        if line.startswith("# "):
            q, _, g = line[2:].rpartition("|"); cur = {"q": q.strip(), "g": g.strip(), "t": {t: [] for t in TIERS}, "notes": {}}; out.append(cur)
            if cur["g"] not in GENRES: errs.append(f"{path}:{ln} unknown genre {cur['g']!r}")
        elif line.startswith("note "):
            k, _, v = line[5:].partition(":"); cur["notes"][k.strip()] = v.strip()
        else:
            m = re.match(r"(\d+):\s*(.*)", line)
            if not m or m.group(1) not in TIERS: errs.append(f"{path}:{ln} bad line: {line[:50]}"); continue
            cur["t"][m.group(1)] += [e.strip() for e in m.group(2).split(";") if e.strip()]
    if len(out) != 7: errs.append(f"{path}: {len(out)} prompts, need 7")
    for p in out:
        seen = {}
        for t in TIERS:
            if not p["t"][t]: errs.append(f"{path}: '{p['q']}' has no answers at tier {t}")
            for ent in p["t"][t]:
                al = [a.strip() for a in ent.split("|")]
                for a in al:
                    k = norm(a)
                    if not k: errs.append(f"{path}: empty alias in '{ent}'"); continue
                    if k in seen and seen[k] != al[0]: errs.append(f"{path}: '{p['q']}': '{a}' ({t}) collides with '{seen[k]}'")
                    seen[k] = al[0]
        if len(p["t"]["100"]) != 1: errs.append(f"{path}: '{p['q']}' needs exactly one 100-point answer")
        names = {e.split("|")[0].strip() for t in TIERS for e in p["t"][t]}
        for k in p["notes"]:
            if k not in names: errs.append(f"{path}: note for unknown answer '{k}'")
    return out, errs
def encode(day):
    js = json.dumps([{"q": p["q"], "g": p["g"], "t": {t: ";".join(p["t"][t]) for t in TIERS}, "notes": p["notes"]} for p in day], ensure_ascii=False, separators=(",", ":"))
    return base64.b64encode(js.encode("utf-8")).decode()[::-1]
def decode(path):
    return json.loads(base64.b64decode(open(path).read().strip()[::-1]).decode("utf-8"))
if __name__ == "__main__":
    if sys.argv[1] == "--decode":
        for p in decode(sys.argv[2]):
            print(f"# {p['q']} | {p.get('g','')}")
            for t in reversed(TIERS): print(f"{t}: " + "; ".join(p["t"][t].split(";")))
            for k, v in p["notes"].items(): print(f"note {k}: {v}")
            print()
        sys.exit()
    src, dst = sys.argv[1], sys.argv[2]; bad = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith(".txt"): continue
        day, errs = parse(os.path.join(src, f))
        if errs: bad += 1; print("\n".join(errs)); continue
        n = int(f[:-4]); open(os.path.join(dst, f"{n}.dat"), "w").write(encode(day))
        print(f"dive {n}: " + ", ".join(str(sum(len(p['t'][t]) for t in TIERS)) for p in day) + " answers")
    sys.exit(1 if bad else 0)
