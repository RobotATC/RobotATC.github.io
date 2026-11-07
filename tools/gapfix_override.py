#!/usr/bin/env python3
"""tools/gapfix_override.json: the designs of cells (b) and (e) under the two-pass start scan (runs tagged v9t in
RobotATC/code/data, see code/data/_gapfix/README.md), chosen as c_design.coordinated chooses them.  make_fronts9.py and
make_trace9.py use them in place of the studio data of those two cells until the whole campaign is re-exported.
Run with the RobotATC environment: <python> tools/gapfix_override.py"""
import json, os, sys, pathlib
SITE = pathlib.Path(__file__).resolve().parents[1]; R = SITE.parent / "ATC" / "RobotATC"; D = R / "code" / "data"
sys.path.insert(0, str(R / "paper" / "manuscript" / "current_master")); import c_design as C
LAMS = (0.0, 0.5, 1.0, 2.0, 8.0); out = {}
ALL = dict(a="cell_a_pick", b="cell_e_mobile", c="cell_g_assembly", d="cell_b_raw", e="cell_j_unload", f="cell_c_machine", g="cell_f_shelf", h="cell_h_palletizing", i="cell_i_mixed")
# CELLS=all OUT=<file>: every cell from its two-pass runs (the defence deck); default: (b) and (e) into tools/gapfix_override.json
for c, key in (ALL.items() if os.environ.get("CELLS") == "all" else (("b", "cell_e_mobile"), ("e", "cell_j_unload"))):
    main = [json.loads((D / f"c_main_{key}_v9t_lam{l:g}.json").read_text()) for l in LAMS]
    ms = [json.loads((D / f"c_multistart_{key}_v9t_lam{l:g}.json").read_text()) for l in LAMS]
    d = dict(main[0]); d["rows"] = sorted([r for m in main for r in m["rows"]], key=lambda r: r["lam"])
    d["ms"] = dict(ms[0], rows=sorted([r for m in ms for r in m["rows"]], key=lambda r: r["lam"]), scan_sizings=ms[0].get("scan_sizings", 0))
    d["aio"] = json.loads((D / f"c_aao_{key}.json").read_text())
    out[c] = {}
    for l in LAMS:
        x = C.coordinated(d, l); a = next(r for r in d["aio"]["rows"] if abs(r["lam"] - l) < 1e-9)["aao"]
        out[c][f"{l:g}"] = dict(a2_mm=x["a"][0], a3_mm=x["a"][1], v_app=x["v_app"], mass_kg=x["mass"], eta=x["eta"], motors=x["motors"],
                               history=x.get("history", []), aio=dict(a=a["a"], v_app=a["v_app"], mass=a["mass"], eta=a["eta"]))
        print(c, l, x["a"], x["v_app"], round(x["mass"], 3), round(x["eta"], 3), "gap", round(1000 * ((x["mass"] - l * x["eta"]) - (a["mass"] - l * a["eta"]))), "g")
pathlib.Path(os.environ.get("OUT") or SITE / "tools" / "gapfix_override.json").write_text(json.dumps(out))
