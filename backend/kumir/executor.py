"""
Kumir Executor - интерпретатор подмножества команд языка Кумир.

Карта поддерживает новый формат:
map_data = {
  "width": W,
  "height": H,
  "cells": [[tile, ...], ...],  # tile: platform|void|broken_floor
  "objects": [{"type": "...", "x": 1, "y": 2, ...}, ...]
}

И совместимость со старым форматом, где "cells" содержали empty/wall/start/finish/trap.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, TypedDict, Literal, cast


class Direction(Enum):
    NORTH = 0
    EAST = 1
    SOUTH = 2
    WEST = 3


class TileType(Enum):
    PLATFORM = "platform"
    VOID = "void"
    BROKEN_FLOOR = "broken_floor"


ObjectType = Literal["wall", "start", "finish", "smart_mine", "lever", "gate"]
GateColor = Literal["orange", "blue", "purple", "green", "red", "yellow"]


class MapObject(TypedDict, total=False):
    type: ObjectType
    x: int
    y: int
    color: GateColor
    open: bool   # gate
    on: bool     # lever


class ExecutionError(Exception):
    """Ошибка выполнения кода"""
    pass


class Robot:
    def __init__(self, x: int, y: int, direction: Direction = Direction.NORTH):
        self.x = x
        self.y = y
        self.direction = direction
        self.history: List[Tuple[int, int, int]] = [(x, y, direction.value)]

    def get_state(self) -> Dict[str, Any]:
        return {"x": self.x, "y": self.y, "direction": self.direction.value}


def _lower(s: Any) -> str:
    return str(s).strip().lower()


def normalize_map(map_data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize map_data to tiles+objects representation. Non-destructive."""
    width = int(map_data.get("width") or 0)
    height = int(map_data.get("height") or 0)
    raw_cells = map_data.get("cells")
    raw_objects = map_data.get("objects")

    # Already new format?
    if isinstance(raw_cells, list) and raw_cells and isinstance(raw_cells[0], list) and isinstance(raw_objects, list):
        # Assume tiles are already in cells; validate/fallback to platform
        cells: List[List[str]] = []
        for y in range(height):
            row = []
            for x in range(width):
                v = _lower(raw_cells[y][x]) if y < len(raw_cells) and x < len(raw_cells[y]) else TileType.PLATFORM.value
                if v not in (TileType.PLATFORM.value, TileType.VOID.value, TileType.BROKEN_FLOOR.value):
                    v = TileType.PLATFORM.value
                row.append(v)
            cells.append(row)
        return {"width": width, "height": height, "cells": cells, "objects": raw_objects}

    # Old format: cells contain empty/wall/start/finish/trap
    cells_old: List[List[Any]] = cast(List[List[Any]], raw_cells or [])
    tiles: List[List[str]] = [[TileType.PLATFORM.value for _ in range(width)] for _ in range(height)]
    objects: List[MapObject] = []

    for y in range(height):
        for x in range(width):
            cell = _lower(cells_old[y][x]) if y < len(cells_old) and x < len(cells_old[y]) else "empty"
            if cell == "wall":
                objects.append({"type": "wall", "x": x, "y": y})
            elif cell == "start":
                objects.append({"type": "start", "x": x, "y": y})
            elif cell == "finish":
                objects.append({"type": "finish", "x": x, "y": y})
            elif cell in ("void", TileType.VOID.value):
                tiles[y][x] = TileType.VOID.value
            elif cell in ("broken_floor", TileType.BROKEN_FLOOR.value):
                tiles[y][x] = TileType.BROKEN_FLOOR.value
            else:
                # empty/trap/unknown => platform to preserve legacy passability
                tiles[y][x] = TileType.PLATFORM.value

    return {"width": width, "height": height, "cells": tiles, "objects": objects}


class GameMap:
    def __init__(self, width: int, height: int, tiles: List[List[str]], objects: List[MapObject]):
        self.width = width
        self.height = height
        self.tiles = tiles
        self.objects = objects

        self.start_pos: Optional[Tuple[int, int]] = None
        self.finish_pos: Optional[Tuple[int, int]] = None

        # Index objects by position for quick lookups
        self.objects_at: Dict[Tuple[int, int], List[MapObject]] = {}
        for obj in objects:
            x = int(obj.get("x", -1))
            y = int(obj.get("y", -1))
            if 0 <= x < width and 0 <= y < height:
                self.objects_at.setdefault((x, y), []).append(obj)

        for (x, y), objs in self.objects_at.items():
            for obj in objs:
                t = _lower(obj.get("type"))
                if t == "start":
                    self.start_pos = (x, y)
                elif t == "finish":
                    self.finish_pos = (x, y)

        # If lever has no explicit 'on', infer from first gate of same color if any
        gates_by_color: Dict[str, bool] = {}
        for obj in objects:
            if _lower(obj.get("type")) == "gate":
                color = _lower(obj.get("color") or "")
                if color and color not in gates_by_color:
                    gates_by_color[color] = bool(obj.get("open", False))
        for obj in objects:
            if _lower(obj.get("type")) == "lever" and "on" not in obj:
                color = _lower(obj.get("color") or "")
                obj["on"] = gates_by_color.get(color, False)

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get_tile(self, x: int, y: int) -> Optional[str]:
        if not self.in_bounds(x, y):
            return None
        return self.tiles[y][x]

    def set_tile(self, x: int, y: int, tile: str) -> None:
        if self.in_bounds(x, y):
            self.tiles[y][x] = tile

    def has_object(self, x: int, y: int, obj_type: str) -> bool:
        for obj in self.objects_at.get((x, y), []):
            if _lower(obj.get("type")) == obj_type:
                return True
        return False

    def get_objects(self, x: int, y: int) -> List[MapObject]:
        return self.objects_at.get((x, y), [])

    def is_finish(self, x: int, y: int) -> bool:
        return self.finish_pos == (x, y)

    def gates_by_color(self) -> Dict[str, List[MapObject]]:
        out: Dict[str, List[MapObject]] = {}
        for obj in self.objects:
            if _lower(obj.get("type")) == "gate":
                c = _lower(obj.get("color") or "")
                if c:
                    out.setdefault(c, []).append(obj)
        return out

    def is_blocked(self, x: int, y: int) -> bool:
        # out of bounds is handled as VOID (fatal), not as wall
        if not self.in_bounds(x, y):
            return False
        # walls
        if self.has_object(x, y, "wall"):
            return True
        # closed gates behave like walls
        for obj in self.get_objects(x, y):
            if _lower(obj.get("type")) == "gate" and not bool(obj.get("open", False)):
                return True
        return False

    def is_void(self, x: int, y: int) -> bool:
        # границы уровня — пустота
        if not self.in_bounds(x, y):
            return True
        return self.get_tile(x, y) == TileType.VOID.value


class KumirExecutor:
    def __init__(self, map_data: Dict[str, Any]):
        normalized = normalize_map(map_data)
        self.game_map = GameMap(
            width=normalized["width"],
            height=normalized["height"],
            tiles=normalized["cells"],
            objects=cast(List[MapObject], normalized.get("objects") or []),
        )

        if not self.game_map.start_pos:
            raise ValueError("Start position not found in map objects")

        self.robot = Robot(*self.game_map.start_pos)
        self.steps_count = 0
        self.max_steps = 10000  # Защита от бесконечных циклов
        # object histories/events for frontend animation
        self.events: List[Dict[str, Any]] = []
        self._collapsed_broken: set[Tuple[int, int]] = set()
        self._actions: List[Dict[str, Any]] = []  # robot primitive actions per tick
        self._mine: Optional[Robot] = None
        self.mine_history: List[Tuple[int, int, int]] = []
        self.gates_history: List[Dict[str, bool]] = []

        # Init smart mine (optional)
        for obj in self.game_map.objects:
            if _lower(obj.get("type")) == "smart_mine":
                mx = int(obj.get("x", -1))
                my = int(obj.get("y", -1))
                if self.game_map.in_bounds(mx, my) and not self.game_map.is_void(mx, my):
                    self._mine = Robot(mx, my, Direction.NORTH)
                break
        if self._mine:
            self.mine_history = [self._mine.history[0]]

        # initial gates snapshot
        self.gates_history = [self._snapshot_gates()]
    
    def execute(self, code: str) -> Dict:
        """Execute Kumir code and return execution result"""
        try:
            lines = self._preprocess(code)
            self._execute_lines(lines)
            
            reached_finish = self.game_map.is_finish(self.robot.x, self.robot.y)
            
            return {
                "success": True,
                "reached_finish": reached_finish,
                "steps_count": self.steps_count,
                "history": self.robot.history,
                "final_position": self.robot.get_state(),
                "error": None,
                "events": self.events,
                "mine_history": self.mine_history,
                "gates_history": self.gates_history,
            }
        
        except ExecutionError as e:
            return {
                "success": False,
                "reached_finish": False,
                "steps_count": self.steps_count,
                "history": self.robot.history,
                "final_position": self.robot.get_state(),
                "error": str(e),
                "events": self.events,
                "mine_history": self.mine_history,
                "gates_history": self.gates_history,
            }
    
    def _preprocess(self, code: str) -> List[str]:
        """Preprocess code: remove comments, trim whitespace"""
        lines = []
        for line in code.split('\n'):
            # Remove comments (everything after |)
            if '|' in line:
                line = line[:line.index('|')]
            
            line = line.strip()
            if line:
                lines.append(line.lower())
        
        return lines
    
    def _execute_lines(self, lines: List[str], start: int = 0, end: Optional[int] = None):
        """Execute a list of lines"""
        if end is None:
            end = len(lines)
        
        i = start
        while i < end:
            line = lines[i]
            
            # Check step limit
            if self.steps_count > self.max_steps:
                raise ExecutionError(f"Превышен лимит шагов: {self.max_steps}")
            
            # Simple commands
            if line == "вперед" or line == "вперёд":
                self._move_forward()
                i += 1
            elif line == "налево":
                self._turn_left()
                i += 1
            elif line == "направо":
                self._turn_right()
                i += 1
            elif line == "использовать":
                # Reserved for lever/gate mechanic (implemented later)
                self._use()
                i += 1
            
            # Loop: нц N раз ... кц
            elif line.startswith("нц"):
                # Find matching кц
                loop_end = self._find_matching_kc(lines, i)
                if loop_end == -1:
                    raise ExecutionError(f"Не найдено завершение цикла 'кц' для строки {i+1}")
                
                # Parse loop count
                parts = line.split()
                if len(parts) >= 3 and parts[2] == "раз":
                    try:
                        count = int(parts[1])
                    except ValueError:
                        raise ExecutionError(f"Неверное количество повторений: {parts[1]}")
                    
                    # Execute loop
                    for _ in range(count):
                        self._execute_lines(lines, i + 1, loop_end)
                else:
                    raise ExecutionError(f"Неверный синтаксис цикла: {line}")
                
                i = loop_end + 1
            
            elif line == "кц":
                # кц without нц - shouldn't happen if code is correct
                raise ExecutionError(f"'кц' без соответствующего 'нц' на строке {i+1}")
            
            else:
                # Unknown command - skip or raise error
                raise ExecutionError(f"Неизвестная команда: {line}")
    
    def _find_matching_kc(self, lines: List[str], nc_index: int) -> int:
        """Find matching 'кц' for 'нц' at nc_index"""
        depth = 1
        for i in range(nc_index + 1, len(lines)):
            if lines[i].startswith("нц"):
                depth += 1
            elif lines[i] == "кц":
                depth -= 1
                if depth == 0:
                    return i
        return -1
    
    def _move_forward(self):
        """Move robot forward"""
        self._actions.append({"type": "move"})
        old_x, old_y = self.robot.x, self.robot.y
        dx, dy = self._get_direction_delta()
        new_x = self.robot.x + dx
        new_y = self.robot.y + dy
        
        # Blocked (walls/closed gates) — не фатально: остаёмся на месте и продолжаем
        if self.game_map.is_blocked(new_x, new_y):
            self.events.append({"type": "bump", "x": new_x, "y": new_y})
            self.robot.history.append((old_x, old_y, self.robot.direction.value))
            self.steps_count += 1
            self._assert_safe_position()
            self._after_robot_tick()
            return

        # Void is fatal (including boundaries)
        if self.game_map.is_void(new_x, new_y):
            self.events.append({"type": "fall", "x": new_x, "y": new_y})
            raise ExecutionError("Робот упал в пустоту")
        
        # Broken floor collapses after first time leaving it (only if move succeeds)
        self._maybe_collapse_broken(old_x, old_y)

        self.robot.x = new_x
        self.robot.y = new_y
        self.robot.history.append((new_x, new_y, self.robot.direction.value))
        self.steps_count += 1

        # If we somehow ended up on void (e.g. map error) — die
        self._assert_safe_position()
        self._after_robot_tick()
    
    def _turn_left(self):
        """Turn robot left"""
        self._actions.append({"type": "turn", "dir": "left"})
        self.robot.direction = Direction((self.robot.direction.value - 1) % 4)
        self.robot.history.append((self.robot.x, self.robot.y, self.robot.direction.value))
        self.steps_count += 1
        self._assert_safe_position()
        self._after_robot_tick()
    
    def _turn_right(self):
        """Turn robot right"""
        self._actions.append({"type": "turn", "dir": "right"})
        self.robot.direction = Direction((self.robot.direction.value + 1) % 4)
        self.robot.history.append((self.robot.x, self.robot.y, self.robot.direction.value))
        self.steps_count += 1
        self._assert_safe_position()
        self._after_robot_tick()

    def _use(self):
        """Use lever (toggle gates of same color)."""
        self._actions.append({"type": "use"})
        used = False
        for obj in self.game_map.get_objects(self.robot.x, self.robot.y):
            if _lower(obj.get("type")) == "lever":
                color = _lower(obj.get("color") or "")
                obj["on"] = not bool(obj.get("on", False))
                used = True
                gates = self.game_map.gates_by_color().get(color, [])
                for gate in gates:
                    gate["open"] = bool(obj["on"])
                self.events.append({"type": "lever_toggle", "x": self.robot.x, "y": self.robot.y, "color": color, "on": bool(obj["on"])})
                break

        if not used:
            # Using on empty cell is allowed but does nothing
            self.events.append({"type": "use_noop", "x": self.robot.x, "y": self.robot.y})
        self.robot.history.append((self.robot.x, self.robot.y, self.robot.direction.value))
        self.steps_count += 1
        self._assert_safe_position()
        self._after_robot_tick()

    def _after_robot_tick(self):
        """Run smart mine tick (delayed by 1 action) and record histories."""
        if not self._mine:
            # snapshot gates each tick (align with robot history length)
            self.gates_history.append(self._snapshot_gates())
            return

        # Mine executes previous robot action (delay 1 tick). For tick 0 -> no-op.
        action_index = len(self._actions) - 2
        if action_index >= 0:
            act = self._actions[action_index]
            try:
                self._mine_apply_action(act)
            except ExecutionError as e:
                self.events.append({"type": "mine_explode", "x": self._mine.x, "y": self._mine.y})
                raise e

        # Collision check after mine action (or no-op)
        if self._mine.x == self.robot.x and self._mine.y == self.robot.y:
            self.events.append({"type": "explode", "who": "robot", "x": self.robot.x, "y": self.robot.y})
            raise ExecutionError("Робот подорвался на умной мине")

        self.mine_history.append((self._mine.x, self._mine.y, self._mine.direction.value))

        # snapshot gates each tick (align with histories length)
        self.gates_history.append(self._snapshot_gates())

    def _mine_apply_action(self, act: Dict[str, Any]):
        if not self._mine:
            return
        t = act.get("type")
        if t == "move":
            old_x, old_y = self._mine.x, self._mine.y
            dx, dy = self._direction_delta(self._mine.direction)
            nx, ny = self._mine.x + dx, self._mine.y + dy
            if self.game_map.is_blocked(nx, ny):
                self.events.append({"type": "mine_bump", "x": nx, "y": ny})
                self._mine.history.append((old_x, old_y, self._mine.direction.value))
                return
            if self.game_map.is_void(nx, ny):
                raise ExecutionError("Умная мина упала в пустоту")
            # broken floor collapses for mine too (only if move succeeds)
            self._maybe_collapse_broken(old_x, old_y)
            self._mine.x, self._mine.y = nx, ny
            self._mine.history.append((nx, ny, self._mine.direction.value))
        elif t == "turn" and act.get("dir") == "left":
            self._mine.direction = Direction((self._mine.direction.value - 1) % 4)
            self._mine.history.append((self._mine.x, self._mine.y, self._mine.direction.value))
        elif t == "turn" and act.get("dir") == "right":
            self._mine.direction = Direction((self._mine.direction.value + 1) % 4)
            self._mine.history.append((self._mine.x, self._mine.y, self._mine.direction.value))
        elif t == "use":
            # Mine also attempts to use (will matter when levers exist)
            self._mine.history.append((self._mine.x, self._mine.y, self._mine.direction.value))
        else:
            self._mine.history.append((self._mine.x, self._mine.y, self._mine.direction.value))

    def _snapshot_gates(self) -> Dict[str, bool]:
        """Return current gate open state per color (any gate of the color)."""
        out: Dict[str, bool] = {}
        for color, gates in self.game_map.gates_by_color().items():
            # define state by first gate
            out[color] = bool(gates[0].get("open", False)) if gates else False
        return out

    def _direction_delta(self, direction: Direction) -> Tuple[int, int]:
        if direction == Direction.NORTH:
            return (0, -1)
        elif direction == Direction.EAST:
            return (1, 0)
        elif direction == Direction.SOUTH:
            return (0, 1)
        else:
            return (-1, 0)

    def _assert_safe_position(self):
        if self.game_map.is_void(self.robot.x, self.robot.y):
            self.events.append({"type": "fall", "x": self.robot.x, "y": self.robot.y})
            raise ExecutionError("Робот упал в пустоту")

    def _maybe_collapse_broken(self, x: int, y: int):
        tile = self.game_map.get_tile(x, y)
        if tile != TileType.BROKEN_FLOOR.value:
            return
        if (x, y) in self._collapsed_broken:
            return
        # Leaving broken floor collapses it into void
        self._collapsed_broken.add((x, y))
        self.game_map.set_tile(x, y, TileType.VOID.value)
        self.events.append({"type": "collapse", "x": x, "y": y})
    
    def _get_direction_delta(self) -> Tuple[int, int]:
        """Get (dx, dy) for current direction"""
        if self.robot.direction == Direction.NORTH:
            return (0, -1)
        elif self.robot.direction == Direction.EAST:
            return (1, 0)
        elif self.robot.direction == Direction.SOUTH:
            return (0, 1)
        elif self.robot.direction == Direction.WEST:
            return (-1, 0)

        return (0, 0)
