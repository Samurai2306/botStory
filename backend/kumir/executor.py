"""
Kumir Executor - интерпретатор подмножества команд языка Кумир
"""
from typing import List, Dict, Tuple, Optional
from enum import Enum


class Direction(Enum):
    NORTH = 0
    EAST = 1
    SOUTH = 2
    WEST = 3


class CellType(Enum):
    EMPTY = "empty"
    WALL = "wall"
    TRAP = "trap"
    START = "start"
    FINISH = "finish"


class ExecutionError(Exception):
    """Ошибка выполнения кода"""
    pass


class Robot:
    def __init__(self, x: int, y: int, direction: Direction = Direction.NORTH):
        self.x = x
        self.y = y
        self.direction = direction
        self.history = [(x, y, direction.value)]
    
    def get_state(self) -> Dict:
        return {
            "x": self.x,
            "y": self.y,
            "direction": self.direction.value
        }


class GameMap:
    def __init__(self, width: int, height: int, cells: List[List[str]]):
        self.width = width
        self.height = height
        self.cells = cells
        self.start_pos = None
        self.finish_pos = None
        
        # Find start and finish positions (case-insensitive for robustness)
        for y in range(height):
            for x in range(width):
                cell = cells[y][x]
                if isinstance(cell, str):
                    cell_lower = cell.lower()
                    if cell_lower == CellType.START.value:
                        self.start_pos = (x, y)
                    elif cell_lower == CellType.FINISH.value:
                        self.finish_pos = (x, y)
    
    def get_cell(self, x: int, y: int) -> Optional[str]:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.cells[y][x]
        return None
    
    def is_wall(self, x: int, y: int) -> bool:
        cell = self.get_cell(x, y)
        return cell == CellType.WALL.value or cell is None
    
    def is_finish(self, x: int, y: int) -> bool:
        return (x, y) == self.finish_pos


class KumirExecutor:
    def __init__(self, map_data: Dict):
        """
        map_data = {
            "width": 10,
            "height": 10,
            "cells": [[...], [...], ...]  # 2D array of cell types
        }
        """
        self.game_map = GameMap(
            width=map_data["width"],
            height=map_data["height"],
            cells=map_data["cells"]
        )
        
        if not self.game_map.start_pos:
            raise ValueError("Start position not found in map")
        
        self.robot = Robot(*self.game_map.start_pos)
        self.steps_count = 0
        self.max_steps = 10000  # Защита от бесконечных циклов
    
    def execute(self, code: str) -> Dict:
        """Execute Kumir code and return execution result"""
        try:
            lines = self._preprocess(code)
            self._execute_lines(lines)
            
            # Check if robot reached finish (position or current cell type, case-insensitive)
            cell = self.game_map.get_cell(self.robot.x, self.robot.y)
            reached_finish = (
                self.game_map.is_finish(self.robot.x, self.robot.y)
                or (cell and str(cell).lower() == CellType.FINISH.value)
            )
            
            return {
                "success": True,
                "reached_finish": reached_finish,
                "steps_count": self.steps_count,
                "history": self.robot.history,
                "final_position": self.robot.get_state(),
                "error": None
            }
        
        except ExecutionError as e:
            return {
                "success": False,
                "reached_finish": False,
                "steps_count": self.steps_count,
                "history": self.robot.history,
                "final_position": self.robot.get_state(),
                "error": str(e)
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
        dx, dy = self._get_direction_delta()
        new_x = self.robot.x + dx
        new_y = self.robot.y + dy
        
        # Check if movement is valid
        if self.game_map.is_wall(new_x, new_y):
            raise ExecutionError(f"Робот врезался в стену на позиции ({new_x}, {new_y})")
        
        self.robot.x = new_x
        self.robot.y = new_y
        self.robot.history.append((new_x, new_y, self.robot.direction.value))
        self.steps_count += 1
    
    def _turn_left(self):
        """Turn robot left"""
        self.robot.direction = Direction((self.robot.direction.value - 1) % 4)
        self.robot.history.append((self.robot.x, self.robot.y, self.robot.direction.value))
        self.steps_count += 1
    
    def _turn_right(self):
        """Turn robot right"""
        self.robot.direction = Direction((self.robot.direction.value + 1) % 4)
        self.robot.history.append((self.robot.x, self.robot.y, self.robot.direction.value))
        self.steps_count += 1
    
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
