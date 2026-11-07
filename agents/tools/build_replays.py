#!/usr/bin/env python3
"""Build agents/data/<cell>_replay.json for the nine cells.

The numbers come from studio/data/manifest.json and studio/data/<cell>_lam1.json (the RobotATC campaign of the
preprint); the sentences are templates with a short hand-written description per cell.  The user turns are written
by the researcher (reference replay), not recorded from a user study.

Usage: python3 agents/tools/build_replays.py        (from the site root)
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
STUDIO = ROOT / "studio" / "data"
OUT = ROOT / "agents" / "data"

GRIP_MM = 85          # gripper length, flange to tip (manifest.grip_m)
APPROACH_MM = 50      # LIN approach / retract (paper, \vApproachMm)
LINK_LO, LINK_HI = 150, 500
V_LO, V_HI = 0.2, 0.6
LAM = 1

# ----------------------------------------------------------------------------- per-cell narrative
# desc: what the user says first (deliberately silent on payload scope, time scope and approach).
# read: how the agent reads the waypoints.  pts: label and fixture per point (sketch of Stage 1).
# approach: the user's answer about approach directions.  Stage 2 has no written text here: it plays the record.
CELLS = {
 # ---- Part 1, transfer: one part per cycle   (final letters 2026-10-04: a-c transfer, d-f tending, g-i stacking)
 "a": dict(
   desc=("A pick-and-place cell. The arm takes a 1 kg part from a conveyor and puts it on a bench, about a second, then goes back for the next part.",
         "픽앤플레이스 셀입니다. 로봇 팔이 컨베이어에서 1 kg 부품을 집어 작업대에 놓고, 1초쯤 걸리고, 다음 부품을 가지러 돌아갑니다."),
   read=("one pick-place pair: P1 pick on the conveyor, P2 place on the bench, back to P1 for the next part",
         "집기–놓기 한 쌍: 컨베이어에서 P1 집기, 작업대에 P2 놓기, 다음 부품을 위해 P1 로 복귀"),
   pts=[("P1 pick", "P1 집기", "conveyor", "컨베이어"), ("P2 place", "P2 놓기", "bench", "작업대")],
   approach=("From above at both.", "둘 다 위에서요."), approach_note=("vertical approach at both points", "두 작업점 모두 수직 접근"),
 ),
 "b": dict(
   desc=("Cart loading. The arm takes a 2.5 kg part out of a bin and pushes it into the docking fixture of a cart, about 1.2 seconds per move, then goes back to the bin.",
         "카트 적재입니다. 빈에서 2.5 kg 부품을 꺼내 카트의 도킹부에 밀어 넣고, 한 번에 1.2초쯤 걸리고, 빈으로 돌아갑니다."),
   read=("one pick-place pair: P1 pick in the bin, P2 dock on the cart, back to P1",
         "집기–놓기 한 쌍: 빈에서 P1 집기, 카트 도킹부에 P2 삽입, P1 로 복귀"),
   pts=[("P1 bin", "P1 빈", "bin", "빈"), ("P2 dock", "P2 도킹", "cart", "카트")],
   approach=("From above at the bin, at an angle into the cart.", "빈에서는 위에서, 카트에는 비스듬히요."),
   approach_note=("vertical approach at P1, 45° into the socket at P2", "P1 은 수직 접근, P2 는 소켓으로 45° 접근"),
 ),
 "c": dict(
   desc=("An inspection line. A 1.5 kg part comes in on a feeder, is set down at a measuring station and then at a marking station, and goes out to a tray; about 1.5 seconds per move.",
         "검사 라인입니다. 1.5 kg 부품이 공급기로 들어와 측정 스테이션, 각인 스테이션에 차례로 놓였다가 트레이로 나갑니다. 한 번에 1.5초쯤입니다."),
   read=("three pairs with the same part: P1 feeder to P2 measuring, P2 to P3 marking, P3 to P4 tray, back to P1",
         "같은 부품으로 쌍 셋: 공급기 P1 → 측정 P2, P2 → 각인 P3, P3 → 트레이 P4, P1 로 복귀"),
   pts=[("P1 feeder", "P1 공급기", "conveyor", "공급기"), ("P2 measure", "P2 측정", "station", "스테이션"), ("P3 mark", "P3 각인", "station", "스테이션"), ("P4 tray", "P4 트레이", "tray", "트레이")],
   approach=("From above at all four.", "넷 다 위에서요."), approach_note=("vertical approach at all four points", "네 점 모두 수직 접근"),
 ),
 # ---- Part 2, tending: loading a machine, unloading it, and both
 "d": dict(
   desc=("Raw part loading. The arm picks a 1.5 kg blank from a table and pushes it into a machine fixture, about a second per move, and comes back for the next blank.",
         "소재 투입 셀입니다. 테이블에서 1.5 kg 소재를 집어 기계 지그에 밀어 넣고, 한 번에 1초쯤 걸리고, 다음 소재를 가지러 돌아옵니다."),
   read=("one pick-place pair: P1 pick on the table, P2 load into the machine fixture, back to P1",
         "집기–놓기 한 쌍: 테이블에서 P1 집기, 기계 지그에 P2 투입, P1 로 복귀"),
   pts=[("P1 pick", "P1 집기", "table", "테이블"), ("P2 load", "P2 투입", "machine", "기계")],
   approach=("From above at the table, straight in at the machine.", "테이블에서는 위에서, 기계에는 옆에서 똑바로요."),
   approach_note=("vertical approach at P1, horizontal into the machine at P2", "P1 은 수직 접근, P2 는 기계로 수평 접근"),
 ),
 "e": dict(
   desc=("Part unloading. The arm reaches into the machine, takes the finished 1 kg part out and sets it on the outfeed conveyor, about 1.2 seconds per move, then goes back for the next one.",
         "부품 반출입니다. 팔이 기계 안으로 들어가 가공이 끝난 1 kg 부품을 꺼내 반출 컨베이어에 놓고, 한 번에 1.2초쯤 걸리고, 다음 부품을 가지러 돌아갑니다."),
   read=("one pick-place pair: P1 pick inside the machine, P2 place on the conveyor, back to P1",
         "집기–놓기 한 쌍: 기계 안에서 P1 집기, 컨베이어에 P2 놓기, P1 로 복귀"),
   pts=[("P1 unload", "P1 반출", "machine", "기계"), ("P2 place", "P2 놓기", "conveyor", "컨베이어")],
   approach=("Straight in at the machine, from above at the conveyor.", "기계에는 옆에서 똑바로, 컨베이어는 위에서요."),
   approach_note=("horizontal into the machine at P1, vertical approach at P2", "P1 은 기계로 수평 접근, P2 는 수직 접근"),
 ),
 "f": dict(
   desc=("Machine tending. A 2.5 kg part comes in on a tray, goes into the chuck, and after machining goes out to a table; 1.2 seconds or so per move.",
         "기계 텐딩입니다. 2.5 kg 부품이 트레이로 들어와 척에 물리고, 가공 뒤 테이블로 나갑니다. 한 번에 1.2초쯤입니다."),
   read=("two pairs: P1 tray to P2 chuck with the raw part, then P2 chuck to P3 table with the finished part, back to P1",
         "쌍 둘: 소재를 트레이 P1 에서 척 P2 로, 가공품을 척 P2 에서 테이블 P3 로, P1 로 복귀"),
   pts=[("P1 tray", "P1 트레이", "tray", "트레이"), ("P2 chuck", "P2 척", "machine", "기계"), ("P3 table", "P3 테이블", "table", "테이블")],
   approach=("From above at the tray and the table, straight in at the chuck.", "트레이와 테이블은 위에서, 척에는 옆에서 똑바로요."),
   approach_note=("vertical approach at P1 and P3, horizontal into the chuck at P2", "P1·P3 는 수직 접근, P2 는 척으로 수평 접근"),
 ),
 # ---- Part 3, stacking: parts accumulate
 "g": dict(
   desc=("Shelf stocking. 1 kg blocks come in on a feeder and go onto the four tiers of a shelf, one per tier, about 1.5 seconds per move.",
         "선반 채우기입니다. 1 kg 블록이 공급기로 들어와 선반 네 단에 하나씩 올라갑니다. 한 번에 1.5초쯤입니다."),
   read=("four pairs from the same pick point: P1 feeder to P2, P3, P4, P5, the four tiers from the bottom up",
         "같은 집기 점에서 쌍 넷: 공급기 P1 에서 P2, P3, P4, P5 의 네 단으로, 아래에서 위로"),
   pts=[("P1 feeder", "P1 공급기", "conveyor", "공급기"), ("P2 tier 1", "P2 1단", "shelf", "선반"), ("P3 tier 2", "P3 2단", "shelf", "선반"), ("P4 tier 3", "P4 3단", "shelf", "선반"), ("P5 tier 4", "P5 4단", "shelf", "선반")],
   approach=("From above at the feeder, from the front at every tier.", "공급기는 위에서, 모든 단은 앞에서요."),
   approach_note=("vertical approach at P1, horizontal from the front at the four tiers", "P1 은 수직 접근, 네 단은 앞에서 수평 접근"),
 ),
 "h": dict(
   desc=("Block stacking. 2.5 kg blocks come off a feeder and are stacked on a tray, two per layer, two layers; 1.8 seconds or so per move.",
         "블록 적재입니다. 2.5 kg 블록이 공급기로 들어와 트레이에 한 층에 둘씩 두 층으로 쌓입니다. 한 번에 1.8초쯤입니다."),
   read=("four pairs from the same pick point: P1 feeder to P2 and P3 on the tray, then to P4 and P5 on top of them",
         "같은 집기 점에서 쌍 넷: 공급기 P1 에서 트레이 위의 P2·P3 로, 그다음 그 위의 P4·P5 로"),
   pts=[("P1 feeder", "P1 공급기", "conveyor", "공급기"), ("P2 layer 1", "P2 1층", "tray", "트레이"), ("P3 layer 1", "P3 1층", "tray", "트레이"), ("P4 layer 2", "P4 2층", "tray", "트레이"), ("P5 layer 2", "P5 2층", "tray", "트레이")],
   approach=("From above everywhere.", "전부 위에서요."), approach_note=("vertical approach at all five points", "다섯 점 모두 수직 접근"),
 ),
 "i": dict(
   desc=("Sorting. Two kinds of block of the same size, 2.5 kg A and 1.5 kg B, come from two tables and are stacked on a tray by kind, A on one place in two layers, B on the other; 1.8 seconds or so per move.",
         "분류 적재입니다. 크기는 같고 무게가 다른 두 종류 블록, 2.5 kg A 와 1.5 kg B 가 테이블 둘에서 와서 트레이에 종류별로 쌓입니다. A 는 한 자리에 두 층, B 는 다른 자리에요. 한 번에 1.8초쯤입니다."),
   read=("three pairs: A from P1 to P3, B from P2 to P4, A from P1 to P5 on top of the first A",
         "쌍 셋: A 를 P1 에서 P3 로, B 를 P2 에서 P4 로, A 를 P1 에서 첫 A 위의 P5 로"),
   pts=[("P1 A", "P1 A", "table", "테이블"), ("P2 B", "P2 B", "table", "테이블"), ("P3 A", "P3 A", "tray", "트레이"), ("P4 B", "P4 B", "tray", "트레이"), ("P5 A", "P5 A", "tray", "트레이")],
   approach=("From above everywhere.", "전부 위에서요."), approach_note=("vertical approach at all five points", "다섯 점 모두 수직 접근"),
 ),
}

# ----------------------------------------------------------------------------- the request in plant terms (2026-10-05)
# desc: what the plant engineer says.  type: the work type in the textbook's terms.  time: how seconds per move follows.
PLANT = {
 "a": dict(desc=("We want a robot to move parts from a conveyor onto a bench. A part weighs 1 kg. The line has to handle 1800 parts an hour, and the robot does nothing else in the cycle.",
                 "컨베이어의 부품을 작업대로 옮길 로봇이 필요합니다. 부품은 1 kg 입니다. 시간당 1800개를 처리해야 하고, 로봇은 이 일만 합니다."),
           type=("material transfer, a pick-and-place operation", "재료 이송, 곧 픽앤플레이스"),
           time=("1800 parts an hour is 2.0 s per cycle. The cycle has two moves, to the bench and back, so 1.0 s per move", "시간당 1800개면 사이클이 2.0초입니다. 작업대로 가는 이동과 돌아오는 이동, 둘이므로 이동당 1.0초입니다")),
 "b": dict(desc=("A robot should take parts out of a bin and push each one into the docking fixture of a cart. A part weighs 2.5 kg. We need 1500 parts an hour.",
                 "빈에서 부품을 꺼내 카트의 도킹부에 하나씩 밀어 넣는 로봇이 필요합니다. 부품은 2.5 kg 이고 시간당 1500개가 필요합니다."),
           type=("material transfer", "재료 이송"),
           time=("1500 parts an hour is 2.4 s per cycle. Two moves, so 1.2 s per move", "시간당 1500개면 사이클이 2.4초입니다. 이동이 둘이므로 이동당 1.2초입니다")),
 "c": dict(desc=("An inspection line for a 1.5 kg part. The part comes in on a feeder, is measured at one station and marked at the next, and leaves on a tray. Measuring takes 1.5 s and marking takes 1.5 s, and the robot waits meanwhile. We need 400 parts an hour.",
                 "1.5 kg 부품의 검사 라인입니다. 부품이 공급기로 들어와 한 스테이션에서 측정되고 다음 스테이션에서 각인된 뒤 트레이로 나갑니다. 측정 1.5초, 각인 1.5초이고 그동안 로봇은 기다립니다. 시간당 400개가 필요합니다."),
           type=("material transfer through two inspection stations", "검사 스테이션 둘을 거치는 재료 이송"),
           time=("400 parts an hour is 9.0 s per cycle. Taking out 1.5 + 1.5 s of station time leaves 6.0 s for four moves, so 1.5 s per move", "시간당 400개면 사이클이 9.0초입니다. 스테이션 시간 1.5 + 1.5초를 빼면 6.0초가 남고, 이동이 넷이므로 이동당 1.5초입니다")),
 "d": dict(desc=("A robot should load blanks from a table into a machine. The machine passes the part on by itself afterwards. A blank weighs 1.5 kg. The machine takes a new blank every 2 seconds.",
                 "테이블의 소재를 기계에 넣는 로봇이 필요합니다. 넣은 뒤에는 기계가 알아서 내보냅니다. 소재는 1.5 kg 이고, 기계는 2초마다 새 소재를 받습니다."),
           type=("machine loading, the case in which the robot only loads", "기계 적재, 곧 로봇이 넣기만 하는 경우"),
           time=("A blank every 2.0 s and two moves, into the machine and back, give 1.0 s per move", "2.0초마다 소재 하나이고 기계로 가는 이동과 돌아오는 이동, 둘이므로 이동당 1.0초입니다")),
 "e": dict(desc=("A moulding machine makes a 1 kg part every 2.4 seconds. A robot should take each part out of the machine and set it on a conveyor.",
                 "성형기가 2.4초마다 1 kg 부품을 하나씩 만듭니다. 로봇이 기계에서 꺼내 컨베이어에 놓아야 합니다."),
           type=("machine unloading, the case of die casting and plastic moulding in which the robot only unloads", "기계 반출, 곧 다이캐스팅·사출 성형처럼 로봇이 꺼내기만 하는 경우"),
           time=("A part every 2.4 s and two moves, to the conveyor and back, give 1.2 s per move", "2.4초마다 부품 하나이고 컨베이어로 가는 이동과 돌아오는 이동, 둘이므로 이동당 1.2초입니다")),
 "f": dict(desc=("One robot should tend a machine tool. Raw parts come on a tray, finished parts go to a table. A part weighs 2.5 kg. Machining takes 20 seconds, and the machine has to deliver a part every 23.6 seconds. The robot has one gripper.",
                 "로봇 한 대가 공작기계를 돌봐야 합니다. 소재는 트레이로 오고 완성품은 테이블로 갑니다. 부품은 2.5 kg 입니다. 가공은 20초이고, 기계에서 23.6초마다 하나씩 나와야 합니다. 그리퍼는 하나입니다."),
           type=("machine loading and unloading; with one gripper the same part is set into the chuck and picked up again there", "기계 적재와 반출. 그리퍼가 하나라 같은 부품을 척에 넣었다가 그 자리에서 다시 집습니다"),
           time=("23.6 s per cycle less 20 s of machining leaves 3.6 s for the robot. Three moves, tray to chuck, chuck to table and back to the tray, so 1.2 s per move", "사이클 23.6초에서 가공 20초를 빼면 로봇에게 3.6초가 남습니다. 트레이에서 척, 척에서 테이블, 다시 트레이, 이동이 셋이므로 이동당 1.2초입니다")),
 "g": dict(desc=("A robot should stock a shelf with blocks that come in on a feeder. A block weighs 1 kg. The shelf has four tiers, 175 mm apart, one block per tier. A full shelf has to be done every 12 seconds.",
                 "공급기로 들어오는 블록을 선반에 채우는 로봇이 필요합니다. 블록은 1 kg 입니다. 선반은 네 단이고 단 간격은 175 mm, 단마다 블록 하나입니다. 선반 하나를 12초에 채워야 합니다."),
           type=("insertion, an application similar to palletizing: the pick point is the same every cycle, the deposit place differs", "삽입, 곧 팔레타이징과 비슷한 작업. 집는 자리는 매번 같고 놓는 자리가 달라집니다"),
           time=("12 s for four blocks. Each block is one move to its tier and one back, eight moves, so 1.5 s per move", "블록 넷에 12초입니다. 블록마다 단으로 가는 이동과 돌아오는 이동이 있어 이동이 여덟이므로 이동당 1.5초입니다")),
 "h": dict(desc=("A robot should stack blocks from a feeder onto a tray: two blocks side by side, 140 mm apart, in two layers. A block weighs 2.5 kg and is 70 mm high. A full tray has to be done every 14.4 seconds.",
                 "공급기의 블록을 트레이에 쌓는 로봇이 필요합니다. 140 mm 간격으로 둘씩 나란히, 두 층입니다. 블록은 2.5 kg 이고 높이 70 mm 입니다. 트레이 하나를 14.4초에 채워야 합니다."),
           type=("palletizing with stacking: the places follow from the spacing, the second layer lies one block height above the first", "쌓기를 포함한 팔레타이징. 자리는 간격에서 정해지고 둘째 층은 블록 높이만큼 위입니다"),
           time=("14.4 s for four blocks and eight moves give 1.8 s per move", "블록 넷에 14.4초이고 이동이 여덟이므로 이동당 1.8초입니다")),
 "i": dict(desc=("A robot should sort two kinds of block of the same size onto one tray. Kind A weighs 2.5 kg and comes from one table, kind B weighs 1.5 kg and comes from another. On the tray A goes on one place in two layers and B on the place beside it, 140 mm away; a block is 70 mm high. A tray of two A and one B has to be done every 10.8 seconds.",
                 "크기가 같은 두 종류의 블록을 한 트레이에 분류해 쌓는 로봇이 필요합니다. A 는 2.5 kg 이고 한 테이블에서, B 는 1.5 kg 이고 다른 테이블에서 옵니다. 트레이에서 A 는 한 자리에 두 층, B 는 140 mm 옆자리에 놓습니다. 블록 높이는 70 mm 입니다. A 둘과 B 하나를 10.8초에 끝내야 합니다."),
           type=("palletizing by kind", "종류별 팔레타이징"),
           time=("10.8 s for three blocks and six moves give 1.8 s per move", "블록 셋에 10.8초이고 이동이 여섯이므로 이동당 1.8초입니다")),
}

# ----------------------------------------------------------------------------- recorded Stage 1 runs (2026-10-05)
# Where a run of the Task agent derived every field of the cell's specification at its first proposal, the page plays
# that run as it was recorded (RobotATC/agents/runs/public); the engineer in it is scripted (plant facts only, accepts
# each proposal).  A run in which the agent searched the textbook is preferred.  Cells without such a run keep the
# written reference dialogue and say so.
RUNS = ROOT.parent / "ATC" / "RobotATC" / "agents" / "runs" / "public"

def recorded_run(cell):
    # the stepwise agent (prompt v4, one field per turn) first; then the v3 runs in which the agent searched or was given passages
    for pattern in (f"task4_{cell}_s?.json", f"task3_{cell}_rag_s?.json", f"task3_{cell}_inject_s?.json"):
        for f in sorted(RUNS.glob(pattern)):
            d = json.loads(f.read_text())
            if d["summary"].get("all_right"): return f.stem, d
    return None, None

STEP_FILLS = {"work_type": [], "program": ["sequence"], "payload": ["payload"], "time": ["timing"], "approach": ["approach"], "all": ["sequence", "payload", "timing", "approach"]}

def html(t):
    import html as H
    t = H.escape(str(t).strip()).replace("`", "")
    # layout only, the words are the model's: one item of an enumeration per line, the field names set off
    t = re.sub(r"\s+(?=\d\)\s)", "\n", t)
    if t.count("; ") >= 3: t = t.replace("; ", ";\n")
    t = re.sub(r"\n\s*-\s+", "\n", t)
    t = re.sub(r"\b(work_type|program|parts|gripper_kg|payload_kg|seconds_per_move|approach|fixtures)\b(?=\s*:)", r"<code>\1</code>", t)
    return re.sub(r"\n+", "<br>", t)

def recorded_chat(cell, run, d, desc):
    S = d["summary"]; out = [dict(who="user", text=desc[0], text_ko=desc[1])]
    for st in d["steps"]:
        c = st["call"]; tool = c.get("tool")
        if tool == "search":
            pages = ", ".join(str(p["page"]) for p in st.get("passages", []))
            out.append(dict(who="agent", kind="tool", text=f"<i>textbook search:</i> {html(c.get('query', ''))}<br><i>passages from pp.</i> {pages}",
                            text_ko=f"<i>교재 검색:</i> {html(c.get('query', ''))}<br><i>찾은 구절의 쪽:</i> {pages}"))
        elif tool == "ask":
            if st.get("guard") or "answer" not in st: continue      # a turn the harness sent back (a step out of order): the engineer never saw it
            m = dict(who="agent", text=html(c.get("message", "")), text_ko=html(c.get("message", "")))
            step = st.get("step") or c.get("step")
            if step:                                 # v4: the card fills field by field, when the engineer has answered that step
                done = STEP_FILLS.get(step, []) if st.get("topic") in ("confirm", "approach") else []   # a field fills when its step is settled, not at a question on the way
                if step == "all": m["confirm"] = True
            else:                                    # v3: everything in one proposal
                done = ["sequence", "payload", "timing", "approach"] if st.get("topic") == "confirm" else []
                if done: m["confirm"] = True
            u = dict(who="user", text=html(st.get("answer", "")), text_ko=html(st.get("answer", "")))
            if step: u["fills"] = done
            else: m["fills"] = done
            out += [m, u]
    seen = set()                                     # a field fills once, at its first confirmed step
    for m in out:
        if m.get("fills"): m["fills"] = [k for k in m["fills"] if k not in seen]; seen.update(m["fills"])
        if "fills" in m and not m["fills"]: del m["fills"]
    return out

# ----------------------------------------------------------------------------- recorded Stage 2 runs
# The page plays one recorded run of the Layout agent per cell (RobotATC/agents/runs/public/layout_<cell>_s<seed>.json):
# the lowest seed whose checks all passed and whose cell has the shape of the reference.  Every line of the log is a
# step of that run; the page adds fixed labels only.  The confirmation in the runs is scripted ("Confirmed.").
CHECK_KO = {"units and frames": "단위와 좌표계", "reach": "도달", "clearance": "간섭", "sizability": "사이징 가능"}

def pts_label(points):
    p = sorted(int(i) for i in points)
    if len(p) > 2 and p == list(range(p[0], p[-1] + 1)): return f"P{p[0]} – P{p[-1]}"
    return ", ".join(f"P{i}" for i in p)

def recorded_layout_run(cell):
    runs = [(f.stem, json.loads(f.read_text())) for f in sorted(RUNS.glob(f"layout_{cell}_s?.json"))]
    for stem, d in runs:
        S = d["summary"]
        if S.get("all_checks_pass") and (S.get("same_as_reference") or {}).get("same_shape"): return stem, d
    if not runs: raise SystemExit(f"no recorded Stage 2 run for cell {cell} in {RUNS}")
    return runs[0]

DIM = {"length_m": ("length", "길이"), "width_m": ("width", "폭"), "top_x_m": ("top x", "상판 x"), "top_y_m": ("top y", "상판 y"), "deck_x_m": ("deck x", "받침 x"),
       "deck_y_m": ("deck y", "받침 y"), "tier_width_m": ("tier width", "단 폭"), "tier_depth_m": ("tier depth", "단 깊이"), "opening_width_m": ("opening width", "개구 폭")}
SIDE_KO = {"above": "위에서", "side": "옆에서"}

def dims_text(dimensions, lang):
    """'length 600, width 170 mm (layout sheet) · top x 170 mm (default)': the dimensions of one fixture, grouped by where they came from."""
    by = {}
    for x in dimensions: by.setdefault(x["source"], []).append(f"{DIM.get(x['name'], (x['name'], x['name']))[lang]} {x['mm']}")
    src = {"layout sheet": ("layout sheet", "배치표"), "default of the model": ("default", "기본값")}
    return " · ".join(f"{', '.join(v)} mm ({src.get(k, (k, k))[lang]})" for k, v in by.items())

def recorded_layout(cell, K):
    run, d = recorded_layout_run(cell); S = d["summary"]
    log = [dict(kind="input", points=[f"P{i + 1}" for i in range(K)])]
    if S.get("layout_sheet"):                        # the sheet the run was given: position, equipment, side, known dimensions
        rows = []
        for r in S["layout_sheet"]:
            xyz = ", ".join(f"{1000 * v:.0f}" for v in r["position_m"][:3]) if isinstance(r["position_m"], (list, tuple)) else str(r["position_m"])
            kn = [dict(name=n, mm=round(1000 * v), source="layout sheet") for n, v in (r.get("known_dimensions_m") or {}).items()]
            rows.append(dict(p=f"P{r['point']}", equipment=r["equipment"], pos=xyz, side=r["entered_from"], side_ko=SIDE_KO.get(r["entered_from"], r["entered_from"]),
                             known=", ".join(f"{DIM.get(x['name'], (x['name'],))[0]} {x['mm']} mm" for x in kn), known_ko=", ".join(f"{DIM.get(x['name'], (0, x['name']))[1]} {x['mm']} mm" for x in kn)))
        log[0]["sheet"] = rows
    builds, checks, stated = [], [], None
    for st in d["steps"]:
        c = st["call"]; tool = c.get("tool"); res = st.get("result")
        if tool == "build_cell":
            r = res if isinstance(res, dict) else {}
            joined = [str(x) for x in r.get("joined") or []]
            jp = [sorted(int(x) for x in re.findall(r"\d+", m.group(1))) for m in (re.search(r"points \[([\d, ]+)\]", x) for x in joined) if m]
            par = {tuple(sorted(x["points"])): x for x in r.get("parameters") or []}
            built = [dict(model=f["model"], points=pts_label(f["points"]), joined=sorted(f["points"]) in jp,
                          dims=dims_text(par.get(tuple(sorted(f["points"])), {}).get("dimensions", []), 0), dims_ko=dims_text(par.get(tuple(sorted(f["points"])), {}).get("dimensions", []), 1)) for f in r.get("fixtures", [])]
            log.append(dict(kind="build", b=len(builds), call=[dict(model=m, points=pts_label(p)) for m, p in c.get("fixtures", [])],
                            ok=bool(r.get("ok")), n=len(built), boxes=r.get("boxes"), joined=joined, error=str(r.get("error") or ""),
                            dims=[dict(model=f["model"], text=f["dims"], text_ko=f["dims_ko"]) for f in built if f["dims"]]))
            builds.append(built)
        elif tool == "check" and isinstance(res, list):
            # line: the tool's detail cut at its first semicolon, for the one-line log; detail: in full, for the list
            checks = [dict(label=x["check"], label_ko=CHECK_KO.get(x["check"], x["check"]), ok=bool(x["ok"]), detail=x["detail"], line=x["detail"].split(";")[0]) for x in res]
            log.append(dict(kind="check", checks=checks))
        elif tool == "state_problem" and isinstance(res, dict):
            stated = res
            log.append(dict(kind="problem", variables=len(res.get("variables", [])), ranges=len(res.get("ranges", {})), constraints=len(res.get("constraints", [])), weights=len(res.get("weights", []))))
        elif tool == "ask":
            log.append(dict(kind="ask", question=c.get("question") or c.get("message") or "", answer=st.get("answer") or ""))
        elif tool == "set_dimension":
            log.append(dict(kind="other", tool="set_dimension", note=f"P{c.get('point')} {DIM.get(str(c.get('name')), (str(c.get('name')),))[0]} {round(1000 * float(c.get('value_m', 0)))} mm"))
        elif tool == "submit":
            log.append(dict(kind="submit"))
        else:                                        # anything else the run contains is shown as it was recorded
            log.append(dict(kind="other", tool=str(tool), note=str(st.get("note") or "")))
    # the problem table: the wording of the page, the values of the recorded state_problem where it gives them
    P = stated or {}; rg = P.get("ranges", {})
    mm = lambda k, lo, hi: tuple(round(1000 * v) for v in rg.get(k, (lo / 1000, hi / 1000)))
    a2, a3 = mm("a2_m", LINK_LO, LINK_HI), mm("a3_m", LINK_LO, LINK_HI); v = rg.get("v_app_mps", (V_LO, V_HI))
    links = f"a₂, a₃ ∈ [{a2[0]}, {a2[1]}] mm" if a2 == a3 else f"a₂ ∈ [{a2[0]}, {a2[1]}] mm · a₃ ∈ [{a3[0]}, {a3[1]}] mm"
    n_wp = (P.get("data") or {}).get("waypoints", K)
    lam = "λ ∈ {" + ", ".join(f"{w:g}" for w in P["weights"]) + "}" if P.get("weights") else f"λ = {LAM}"
    coll = any("collision" in x for x in P.get("constraints", []))
    problem = [
      dict(label="Variables", label_ko="변수", value=f"{links} · v_app ∈ [{v[0]:g}, {v[1]:g}] m/s · six actuators from the catalog", value_ko=f"{links} · v_app ∈ [{v[0]:g}, {v[1]:g}] m/s · 카탈로그에서 구동기 여섯"),
      dict(label="Objective", label_ko="목적", value=f"min  M − λ·η,  {lam}", value_ko=f"min  M − λ·η,  {lam}"),
      dict(label="Constraints", label_ko="제약", value=f"all {n_wp} waypoints reachable (closed-form IK) · torque and speed within the ratings along the program (RNEA)" + (" · no collision with the fixtures, the standing parts and the floor" if coll else ""),
           value_ko=f"{n_wp}개 작업점 도달(닫힌형 IK) · 프로그램 내 토크·속도가 정격 안(RNEA)" + (" · 설비·놓인 부품·바닥과 충돌 없음" if coll else "")),
      dict(label="Decomposition", label_ko="분해", value="kinematics (coverage, SQP) ‖ dynamics (sizing, pattern search), shared (a₂, a₃)", value_ko="기구학(커버리지, SQP) ‖ 동역학(사이징, pattern search), 공유 (a₂, a₃)"),
    ]
    return dict(run=run, submitted=bool(S.get("submitted")),
                note=f"Recorded run of {S.get('model', 'the model')} ({run}). The confirmation in it is scripted. Tool calls and results are shown as recorded.",
                note_ko=f"{S.get('model', '모델')} 의 기록된 실행입니다 ({run}). 확인 답변은 대본입니다. 도구 호출과 결과는 기록 그대로입니다.",
                fixtures=builds[-1] if builds else [], builds=builds, checks=checks, problem=problem, log=log)

def fmt_pair(v):
    return f"{v[0]:.0f}, {v[1]:.0f} mm"

# ----------------------------------------------------------------------------- build
def build(cell, man):
    rec = json.loads((STUDIO / f"{cell}_lam1.json").read_text())
    meta = man["cells"][cell]; N = CELLS[cell]
    K, payload, tseg = meta["K"], meta["payload_kg"], meta["t_seg_s"]
    prog = rec.get("program") or {}
    pairs = [tuple(pp) for pp in prog.get("pairs") or [(i, (i + 1) % K) for i in range(K)]]
    pairs = [(pp[0], pp[1], pp[2] if len(pp) > 2 else "A") for pp in pairs]
    parts = prog.get("parts") or {"A": {"size": [0.056] * 3, "mass": payload - 0.5}}
    grip_kg = prog.get("gripper_kg", 0.5)
    cyc = rec.get("cycle") or {}
    cycle_s = float(cyc["t"][-1]) if cyc.get("t") else tseg * 2 * len(pairs)
    n_legs = 2 * len(pairs)
    tsg = f"{tseg:g}"
    approach_dir = ["down" if a[2] < -0.9 else "side" for a in rec["approach"]]
    pair_txt = " · ".join(f"P{a + 1} → P{b + 1}" for a, b, _ in pairs)
    seq_en = pair_txt + ", back to P1"; seq_ko = pair_txt + ", P1 로 복귀"
    masses = sorted({(pt, parts[pt]["mass"]) for _, _, pt in pairs})
    pay_en = " and ".join(f"{m:g} kg ({k})" if len(masses) > 1 else f"{m:g} kg" for k, m in masses)
    pay_ko = pay_en

    # ---- task agent dialogue (2026-10-05): the engineer speaks in plant terms; the agent derives the robot terms from the
    # textbook and proposes them; the engineer confirms.  The numbers are those of the cell, the derivations those of
    # RobotATC/agents/cases/<cell>.json.
    P_ = PLANT[cell]
    chat = [
      dict(who="user", text=P_["desc"][0], text_ko=P_["desc"][1]),
      dict(who="agent", fills=["sequence"],
           text=f"In the textbook's terms this is {P_['type'][0]} (Groover, ch. 8). I read {N['read'][0]}. Positions come from the plant drawing. Is that the job?",
           text_ko=f"교재의 분류로는 {P_['type'][1]}입니다 (Groover 8장). {N['read'][1]}로 읽었습니다. 위치는 도면에서 가져옵니다. 이 작업이 맞습니까?"),
      dict(who="user", text="Yes.", text_ko="네, 맞습니다."),
      dict(who="agent", asks="payload_scope", text="What the robot carries is the part and the gripper together (net load capacity, p. 213). Which gripper will it use?", text_ko="로봇이 드는 것은 부품과 그리퍼를 합친 무게입니다 (순 하중, 213쪽). 어떤 그리퍼를 쓰십니까?"),
      dict(who="user", text="The vendor's two-finger gripper, 0.5 kg.", text_ko="벤더의 두 손가락 그리퍼이고 0.5 kg 입니다."),
      dict(who="agent", fills=["payload"],
           text=f"Then the payload is {pay_en} plus {grip_kg:g} kg on the carrying moves, and the gripper alone on the way back.",
           text_ko=f"그러면 들고 가는 이동의 하중은 {pay_ko} 에 {grip_kg:g} kg 을 더한 값이고, 돌아오는 이동은 그리퍼만입니다."),
      dict(who="agent", asks="time_scope", fills=["timing"], text=P_["time"][0] + " (cycle time, pp. 225 to 226). Shall I take that?", text_ko=P_["time"][1] + " (사이클 시간, 225–226쪽). 이대로 잡을까요?"),
      dict(who="user", text="Yes.", text_ko="네."),
      dict(who="agent", asks="approach", text="From which side is each point entered?", text_ko="각 자리에는 어느 쪽에서 들어갑니까?"),
      dict(who="user", text=N["approach"][0], text_ko=N["approach"][1]),
      dict(who="agent", fills=["approach"], confirm=True,
           text=f"Noted: {N['approach_note'][0]}, with an approach and a depart move of {APPROACH_MM} mm at each point (p. 230). The approach speed is left to the design, within {V_LO} to {V_HI} m/s. Please confirm the task specification.",
           text_ko=f"확인: {N['approach_note'][1]}, 자리마다 접근·후퇴 {APPROACH_MM} mm 를 둡니다 (230쪽). 접근 속도는 {V_LO}–{V_HI} m/s 안에서 설계가 정합니다. 작업 사양을 확인해 주세요."),
    ]
    run, rec_run = recorded_run(cell)
    if run:
        chat = recorded_chat(cell, run, rec_run, P_["desc"])
        skipped = sum(1 for st in rec_run["steps"] if st["call"].get("tool") == "ask" and (st.get("guard") or "answer" not in st))
        task_note = (f"Recorded run of gpt-oss:20b ({run}). The engineer in it is scripted: plant facts only, and every proposal is accepted. The dialogue is shown as it was produced" + (f"; {skipped} turn{'s' if skipped != 1 else ''} the harness sent back for being out of order {'are' if skipped != 1 else 'is'} left out." if skipped else "."),
                     f"gpt-oss:20b 의 기록된 실행입니다 ({run}). 엔지니어는 대본입니다: 공장의 사실만 알고 제안을 모두 수락합니다. 대화는 나온 그대로입니다" + (f"; 순서를 벗어나 실행틀이 되돌린 {skipped} 턴은 뺐습니다." if skipped else "."))
    else:
        task_note = ("Written reference dialogue. No recorded run of this cell had every field right at the first proposal, so the page shows the derivation the cell was defined with.",
                     "쓴 참조 대화입니다. 이 셀은 첫 제안에서 모든 칸이 맞은 기록이 없어, 셀을 정의할 때의 도출 과정을 보입니다.")
    task_card = [
      dict(key="sequence", label="Program", label_ko="프로그램", value=seq_en, value_ko=seq_ko, source="work type and program, read from the request", source_ko="요구에서 읽은 작업 유형과 프로그램", chip=pair_txt, chip_ko=pair_txt),
      dict(key="payload", label="Payload", label_ko="하중", value=f"{pay_en} + gripper {grip_kg:g} kg on the carrying legs; gripper alone on the return", value_ko=f"들고 가는 구간 {pay_ko} + 그리퍼 {grip_kg:g} kg; 복귀는 그리퍼만",
           source="part mass + gripper (textbook, p. 213)", source_ko="부품 질량 + 그리퍼 (교재 213쪽)", chip=f"{payload:.1f} kg", chip_ko=f"{payload:.1f} kg"),
      dict(key="timing", label="Timing", label_ko="시간", value=f"{tseg:.1f} s per move", value_ko=f"이동당 {tseg:.1f} s",
           source="derived from the required rate (textbook, pp. 225 to 226)", source_ko="요구 생산량에서 도출 (교재 225–226쪽)", chip=f"{tseg:.1f} s per move", chip_ko=f"동작당 {tseg:.1f} s"),
      dict(key="approach", label="Approach", label_ko="접근", value=f"{N['approach_note'][0]}, {APPROACH_MM} mm (default)", value_ko=f"{N['approach_note'][1]}, {APPROACH_MM} mm (기본값)",
           source=f"answer: “{N['approach'][0].rstrip('.')}”", source_ko=f"답변: “{N['approach'][1].rstrip('.')}”", chip=f"{APPROACH_MM} mm", chip_ko=f"{APPROACH_MM} mm"),
      dict(key="range", label="Approach speed", label_ko="접근 속도", value=f"{V_LO} – {V_HI} m/s (process limit, decided by the design)", value_ko=f"{V_LO} – {V_HI} m/s (공정 한계, 설계가 정함)",
           source="stated by the agent, confirmed with the card", source_ko="에이전트가 알림, 카드와 함께 확인", chip=f"{V_LO} – {V_HI} m/s", chip_ko=f"{V_LO} – {V_HI} m/s"),
    ]
    if run:                                         # in a recorded run every value was proposed by the agent and confirmed
        # the source of a row: the textbook pages the agent cited at the step that settled it (stepwise runs); nothing otherwise,
        # since the line under the card already says that every value was proposed by the agent and confirmed
        cited = {}
        for st in rec_run["steps"]:
            step = st.get("step") or st["call"].get("step")
            pages = sorted({int(x) for x in re.findall(r"\bpp?\.\s*(\d{2,3})", st["call"].get("message", "") or "")})
            for k in STEP_FILLS.get(step or "", []):
                if pages and step != "all": cited.setdefault(k, pages)
        for c in task_card:
            if c["key"] == "range": continue
            pg = cited.get(c["key"])
            c["source"] = ("textbook, p. " + ", ".join(map(str, pg))) if pg else ""; c["source_ko"] = ("교재 " + ", ".join(map(str, pg)) + "쪽") if pg else ""
    sketch = dict(points=[dict(label=w[0], label_ko=w[1], fixture=w[2], fixture_ko=w[3], approach=approach_dir[i]) for i, w in enumerate(N["pts"])],
                  pairs=[[a, b, pt] for a, b, pt in pairs])

    # ---- layout: the recorded run of the Layout agent, step by step
    layout = recorded_layout(cell, K)

    # ---- optimization: the coordinator narrates the recorded run
    co = rec["coordination"]; d = rec["design"]; n = len(co)
    r_w = next((i for i in range(1, n) if co[i]["w"] > co[i - 1]["w"]), None)
    r_10 = next((i for i, h in enumerate(co) if h["gap_mm"] < 10), None)
    starts = d.get("starts", [])
    starts_en = "Three starts, best kept." if len(starts) == 3 else f"Three starts, {len(starts)} converged, best kept."
    starts_ko = "시작점 셋, 최선을 택합니다." if len(starts) == 3 else f"시작점 셋 중 {len(starts)}개 수렴, 최선을 택합니다."
    opt_chat = [
      dict(who="agent", round=0,
           text=f"Weight λ = {LAM} (default). {starts_en} Round 1: target ({fmt_pair(co[0]['a0'])}), kinematics ({fmt_pair(co[0]['a1'])}), dynamics ({fmt_pair(co[0]['a2'])}), {co[0]['gap_mm']:.0f} mm apart.",
           text_ko=f"가중치 λ = {LAM} (기본값). {starts_ko} 1 라운드: 목표값 ({fmt_pair(co[0]['a0'])}), 기구학 ({fmt_pair(co[0]['a1'])}), 동역학 ({fmt_pair(co[0]['a2'])}), {co[0]['gap_mm']:.0f} mm 차이."),
    ]
    if r_w is not None:
        opt_chat.append(dict(who="agent", round=r_w, text=f"Round {r_w + 1}: the copies did not close in, so the weight rises, w {co[r_w - 1]['w']:.2f} → {co[r_w]['w']:.2f}.",
                             text_ko=f"{r_w + 1} 라운드: 두 사본이 더 좁혀지지 않아 가중치를 올립니다, w {co[r_w - 1]['w']:.2f} → {co[r_w]['w']:.2f}."))
    if r_10 is not None and r_10 not in (0, r_w, n - 1):
        opt_chat.append(dict(who="agent", round=r_10, text=f"Round {r_10 + 1}: {co[r_10]['gap_mm']:.1f} mm apart, v_app {co[r_10]['v_app']:.2f} m/s.",
                             text_ko=f"{r_10 + 1} 라운드: {co[r_10]['gap_mm']:.1f} mm 차이, v_app {co[r_10]['v_app']:.2f} m/s."))
    opt_chat += [
      dict(who="agent", round=n - 1, text=f"Round {n}: the copies agree within 1 mm. Re-verifying the design on the full cycle.", text_ko=f"{n} 라운드: 두 사본이 1 mm 안에서 일치. 전체 사이클로 설계를 재검증합니다."),
      dict(who="agent", at="design", confirm=True,
           text=f"Design: tubes {d['a2_mm']:.0f} / {d['a3_mm']:.0f} mm, v_app {d['v_app']:.2f} m/s, {' · '.join(m.replace('_', '-') for m in d['motors'])}, {d['mass_kg']:.3f} kg, η {d['eta']:.3f}. Best of three starts: {d.get('best_start', d.get('start'))}. Accept?",
           text_ko=f"설계: 튜브 {d['a2_mm']:.0f} / {d['a3_mm']:.0f} mm, v_app {d['v_app']:.2f} m/s, {' · '.join(m.replace('_', '-') for m in d['motors'])}, {d['mass_kg']:.3f} kg, η {d['eta']:.3f}. 시작점 셋 중 최선: {d.get('best_start', d.get('start'))}. 받아들이시겠습니까?"),
      dict(who="user", text="Accept.", text_ko="받아들여."),
    ]

    return dict(
      cell=cell, name=meta["name"], name_ko=NAMES_KO[cell], K=K, payload_kg=payload, t_seg_s=tseg, pairs=len(pairs), cycle_s=round(cycle_s, 2), mode="reference_replay",
      note="Stage 1: a recorded run of the Task agent where one had every field right, else a written reference dialogue (task_mode). Stage 2: a recorded run of the Layout agent (layout.run). Stage 3: coordination numbers from studio/data (final RobotATC campaign).",
      note_ko="페이지용 대본 리플레이. 사용자 발화는 연구자가 쓴 것(reference replay)이고 사용자 연구 기록이 아님. 설비·검사·조율 수치는 studio/data (RobotATC 캠페인 7, 집기–놓기 프로그램)에서 옴.",
      chat=chat, task_card=task_card, sketch=sketch, task_mode="recorded" if run else "reference", task_run=run, task_note=task_note[0], task_note_ko=task_note[1],
      layout=layout,
      opt=dict(chat=opt_chat),
    )

NAMES_KO = {"a": "픽앤플레이스", "b": "카트 적재", "c": "검사 라인", "d": "소재 투입", "e": "부품 반출", "f": "기계 텐딩", "g": "다단 선반", "h": "블록 적재", "i": "분류 적재"}

if __name__ == "__main__":
    man = json.loads((STUDIO / "manifest.json").read_text())
    OUT.mkdir(exist_ok=True)
    for cell in "abcdefghi":
        out = build(cell, man)
        (OUT / f"{cell}_replay.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        print(cell, out["name"], "K", out["K"], "checks", [c["detail"][:60] for c in out["layout"]["checks"][1:3]])
