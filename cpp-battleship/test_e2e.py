"""Plays a full game against the compiled main.cpp through stdin.

Usage: python3 test_e2e.py ./battleship

Shooting the last COM cell (in map order) only ever sinks that one cell, because the sinking loop
clears to the right. Three such shots always win, wherever the ships were placed.
"""
import subprocess
import sys

proc = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

# the program prints the map twice while placing ships; the second print has both fleets
maps = []
while len(maps) < 20:
    line = proc.stdout.readline()
    if not line:
        sys.exit("program exited before printing both maps")
    cells = line.split()
    if len(cells) == 10:
        maps.append([int(v) for v in cells])
grid = maps[10:]

def cells_of(owner):
    return [(r, c) for r in range(10) for c in range(10) if grid[r][c] == owner]

player, com = cells_of(1), cells_of(2)
assert len(player) == 9 and all(r <= 3 for r, _ in player), f"player ships: {player}"
assert len(com) == 9 and all(5 <= r <= 8 for r, _ in com), f"COM ships: {com}"

targets = com[-3:][::-1]
moves = "".join(f"{c + 1}\n{r + 1}\n" for r, c in targets)
try:
    out, _ = proc.communicate(moves, timeout=10)
except subprocess.TimeoutExpired:
    proc.kill()
    sys.exit("no 'Human Win' after three hits")

for r, c in targets:
    assert f"{c}You destroy a ship" in out, f"no hit reported for column {c + 1}, row {r + 1}"
assert out.count("You destroy a ship") == 3, out
assert out.rstrip().endswith("Human Win"), out[-300:]
assert proc.returncode == 0, proc.returncode
print(f"won by shooting {[(c + 1, r + 1) for r, c in targets]} (column, row)")
