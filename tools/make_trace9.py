#!/usr/bin/env python3
"""assets/c_trace9.png: the coordination of the nine cells at lambda = 1 on the plane of the link lengths, 3 x 3.

Drawn from studio/data/<cell>_lam1.json, the run the studio and the agents page replay (the best of the three starts),
so the figure, the studio and the numbers of the page show the same runs.  Usage: python3 tools/make_trace9.py
"""
import json, pathlib
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os
# for the defence deck: FIG_OUT (folder), FIG_FONT, FIG_SIZE (base font size), FIG_GRID=2x5 (two rows of five), GAPFIX_OVERRIDE (json of gapfix_override.py)
OUT_DIR = pathlib.Path(os.environ["FIG_OUT"]) if os.environ.get("FIG_OUT") else None; FONT = os.environ.get("FIG_FONT", "DejaVu Sans"); FS = float(os.environ.get("FIG_SIZE", 0)); WIDE = os.environ.get("FIG_GRID") == "2x5"; LW = float(os.environ.get("FIG_LW", 1))      # FIG_LW: factor on line widths and marker sizes
OVP = pathlib.Path(os.environ.get("GAPFIX_OVERRIDE", pathlib.Path(__file__).resolve().parent / "gapfix_override.json"))

ROOT = pathlib.Path(__file__).resolve().parents[1]; D = ROOT / "studio" / "data"
GREEN, RED, NAVY, STEEL = "#2F855A", "#9B2C2C", "#1A365D", "#5F6B7A"
man = json.loads((D / "manifest.json").read_text())
OV = json.loads(OVP.read_text()) if OVP.exists() else {}
B = FS or 8; plt.rcParams.update({"font.family": FONT, "font.size": B, "mathtext.fontset": "stix" if FONT != "DejaVu Sans" else "dejavusans"})
fig, axs = plt.subplots(2, 5, figsize=(15.0, 6.3)) if WIDE else plt.subplots(3, 3, figsize=(9.0, 8.4)); stats = []
if WIDE: axs.flat[9].axis("off")
for ax, c in zip(axs.flat, "abcdefghi"):
    r = json.loads((D / f"{c}_lam1.json").read_text()); h = r["coordination"]; d = r["design"]
    if c in OV: d = OV[c]["1"]; h = d["history"]           # cells re-run with the two-pass start scan
    a0, a1, a2 = (np.array([x[k] for x in h]) for k in ("a0", "a1", "a2"))
    ax.plot(a1[:, 0], a1[:, 1], "-o", color=GREEN, ms=2.6 * LW, lw=1.0 * LW, label="kinematics")
    ax.plot(a2[:, 0], a2[:, 1], "-s", color=RED, ms=2.6 * LW, lw=1.0 * LW, label="dynamics")
    ax.annotate("1", a1[0], xytext=(4, 3), textcoords="offset points", color=GREEN, fontsize=B)
    ax.annotate("1", a2[0], xytext=(4, -9), textcoords="offset points", color=RED, fontsize=B)
    ax.plot(d["a2_mm"], d["a3_mm"], "o", color=NAVY, ms=8 * LW, mfc="none", mew=1.4 * LW, zorder=5)
    # a square frame around the run, so a distance reads the same in both directions
    P = np.vstack([a1, a2]); ctr = (P.max(0) + P.min(0)) / 2; half = max(40.0, (P.max(0) - P.min(0)).max() * 0.6)
    ax.set_xlim(ctr[0] - half, ctr[0] + half); ax.set_ylim(ctr[1] - half, ctr[1] + half); ax.set_aspect("equal")
    ax.set_title(f"({c}) {man['cells'][c]['name']}, {len(h)} iterations", fontsize=B + 1, color=NAVY)
    ax.set_xlabel("$a_2$ [mm]"); ax.set_ylabel("$a_3$ [mm]"); ax.tick_params(labelsize=B - 1, colors=STEEL)
    for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    for sp in ("left", "bottom"): ax.spines[sp].set_color("#D5DAE1")
    ax.grid(color="#EEF1F5", lw=0.6)
    stats.append((c, len(h), round(h[0]["gap_mm"]), round(d["a2_mm"]), round(d["a3_mm"])))
if WIDE:
    hd, lb = axs.flat[0].get_legend_handles_labels(); hd.append(plt.Line2D([], [], marker="o", color=NAVY, mfc="none", mew=1.4 * LW, ms=8 * LW, ls="")); lb.append("coordinated design")
    axs.flat[9].legend(hd, lb, frameon=False, fontsize=B + 1, loc="center")
else: axs.flat[0].legend(frameon=False, fontsize=7, loc="best")
fig.tight_layout(); fig.savefig((OUT_DIR or ROOT / "assets") / "c_trace9.png", dpi=170); print(stats)
print("iterations", min(s[1] for s in stats), "-", max(s[1] for s in stats), "| first gap", min(s[2] for s in stats), "-", max(s[2] for s in stats), "mm")
