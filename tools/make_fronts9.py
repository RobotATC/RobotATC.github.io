#!/usr/bin/env python3
"""assets/c_fronts9.png: mass against coverage of the five coordinated designs of each cell, 3 x 3, with the all-in-one
solutions.  Drawn from studio/data/<cell>_lam<w>.json (the final campaign, best of the three starts), like the
coordination figure of the page.  Usage: python3 tools/make_fronts9.py
"""
import json, pathlib
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os
# for the defence deck: FIG_OUT (folder), FIG_FONT, FIG_SIZE (base font size), FIG_GRID=2x5 (two rows of five), GAPFIX_OVERRIDE (json of gapfix_override.py)
OUT_DIR = pathlib.Path(os.environ["FIG_OUT"]) if os.environ.get("FIG_OUT") else None; FONT = os.environ.get("FIG_FONT", "DejaVu Sans"); FS = float(os.environ.get("FIG_SIZE", 0)); WIDE = os.environ.get("FIG_GRID") == "2x5"; LW = float(os.environ.get("FIG_LW", 1))      # FIG_LW: factor on line widths and marker sizes
OVP = pathlib.Path(os.environ.get("GAPFIX_OVERRIDE", pathlib.Path(__file__).resolve().parent / "gapfix_override.json"))

ROOT = pathlib.Path(__file__).resolve().parents[1]; D = ROOT / "studio" / "data"
RED, NAVY, STEEL, GRAY = "#9B2C2C", "#1A365D", "#5F6B7A", "#8E98A3"
OV = json.loads(OVP.read_text()) if OVP.exists() else {}
LAMS = ("0", "0.5", "1", "2", "8"); man = json.loads((D / "manifest.json").read_text())
B = FS or 8; plt.rcParams.update({"font.family": FONT, "font.size": B, "mathtext.fontset": "stix" if FONT != "DejaVu Sans" else "dejavusans"})
fig, axs = plt.subplots(2, 5, figsize=(15.0, 6.3)) if WIDE else plt.subplots(3, 3, figsize=(9.0, 7.8))
if WIDE: axs.flat[9].axis("off")
for ax, c in zip(axs.flat, "abcdefghi"):
    ds = [json.loads((D / f"{c}_lam{w}.json").read_text())["design"] for w in LAMS]
    if c in OV: ds = [OV[c][w] for w in LAMS]          # cells re-run with the two-pass start scan (tools/gapfix_override.py)
    aio = [(d["aio"]["eta"], d["aio"]["mass"]) for d in ds if d.get("aio") and d["aio"].get("eta") is not None]
    if aio: ax.plot([p[0] for p in aio], [p[1] for p in aio], "x", color=os.environ.get("FIG_AIO_COLOR", GRAY), ms=6 * LW, mew=1.3 * LW, label="all-in-one", zorder=2)      # FIG_AIO_COLOR: the colour of the deck's single-cell front
    ax.plot([d["eta"] for d in ds], [d["mass_kg"] for d in ds], "-o", color=RED, ms=4.5 * LW, lw=1.1 * LW, label="coordinated", zorder=3)
    # weights whose designs coincide, or nearly (within 5 % of the panel), share one label at the last of them
    ex = max(d["eta"] for d in ds) - min(d["eta"] for d in ds) or 1.0; mx = max(d["mass_kg"] for d in ds) - min(d["mass_kg"] for d in ds) or 1.0
    groups = []
    for w, d in zip(LAMS, ds):
        g = groups[-1] if groups else None
        if g and abs(d["eta"] - g[1]["eta"]) < 0.05 * ex and abs(d["mass_kg"] - g[1]["mass_kg"]) < 0.05 * mx: g[0].append(w); g[1] = d
        else: groups.append([[w], d])
    for ws, d in groups: ax.annotate(", ".join(ws), (d["eta"], d["mass_kg"]), xytext=(5, 6), textcoords="offset points", color=RED, fontsize=B)
    ax.set_title(f"({c}) {man['cells'][c]['name']}", fontsize=B + 1, color=NAVY)
    ax.set_xlabel("coverage $\\eta$"); ax.set_ylabel("mass $M$ [kg]"); ax.tick_params(labelsize=B - 1, colors=STEEL); ax.margins(0.16)
    ax.invert_xaxis()                                # more coverage to the left, so lower left is better in both objectives, as a Pareto front is read
    for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    for sp in ("left", "bottom"): ax.spines[sp].set_color("#D5DAE1")
    ax.grid(color="#EEF1F5", lw=0.6)
if WIDE: axs.flat[9].legend(*axs.flat[0].get_legend_handles_labels(), frameon=False, fontsize=B + 1, loc="center", title="weight λ at each design")
else: axs.flat[0].legend(frameon=False, fontsize=7, loc="upper right")
fig.tight_layout(); fig.savefig((OUT_DIR or ROOT / "assets") / "c_fronts9.png", dpi=170); print("written")
