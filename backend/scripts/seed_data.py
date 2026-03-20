"""
Seed database with sample data
Usage: python scripts/seed_data.py
"""
import sys
sys.path.append('.')

from app.db.database import SessionLocal
from app.db.models import Level, News, User, UserRole
from app.core.security import get_password_hash


def seed_levels(db):
    """Create sample levels"""
    levels = [
        {
            "title": "Обучение",
            "description": "Обучение работе с терминалом (команды и подсказки)",
            "narrative": """
Добро пожаловать в обучение терминалу!

В этом проекте брифинг выглядит как терминал: система выводит инструкции, а ты вводишь команды.

Доступные команды:
- help
  показать справку
- add_word <слово>
  добавить слово для текущего уровня (до 10 слов)
- set_hint <слово>
  сохранить одно слово-подсказку для всех будущих уровней
- start
  начать миссию (перейти к уровню)

Примеры:
add_word цикл
add_word проверка
set_hint алгоритм
start
""",
            "order": 0,
            "difficulty": 1,
            "map_data": {
                "width": 2,
                "height": 2,
                "cells": [
                    ["start", "finish"],
                    ["empty", "empty"]
                ]
            },
            "golden_code": "вперед",
            "golden_steps_count": 1
        },
        {
            "title": "Первые шаги",
            "description": "Научись управлять роботом",
            "narrative": """
Добро пожаловать, исследователь!

Перед тобой робот, который умеет выполнять простые команды.
Твоя задача - довести робота до финиша, используя команды:
- вперед - шаг вперёд
- налево - поворот налево
- направо - поворот направо

Робот начинает движение с зелёной клетки и должен достичь золотой.
Удачи!
""",
            "order": 1,
            "difficulty": 1,
            "map_data": {
                "width": 5,
                "height": 5,
                "cells": [
                    ["empty", "empty", "empty", "empty", "empty"],
                    ["empty", "start", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "finish", "empty", "empty"]
                ]
            },
            "golden_code": "вперед\nвперед\nнаправо\nвперед",
            "golden_steps_count": 4
        },
        {
            "title": "Обход препятствий",
            "description": "Научись обходить стены",
            "narrative": """
Внимание! На твоём пути появились препятствия!

Чёрные клетки - это стены. Робот не может пройти через них.
Тебе нужно найти путь в обход.

Помни: иногда самый короткий путь - не прямая линия.
""",
            "order": 2,
            "difficulty": 2,
            "map_data": {
                "width": 6,
                "height": 6,
                "cells": [
                    ["empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "start", "empty", "wall", "empty", "empty"],
                    ["empty", "empty", "empty", "wall", "empty", "empty"],
                    ["empty", "wall", "wall", "wall", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "finish", "empty", "empty", "empty"]
                ]
            },
            "golden_code": "направо\nвперед\nвперед\nвперед\nвперед\nналево\nвперед\nвперед\nналево\nвперед\nвперед",
            "golden_steps_count": 11
        },
        {
            "title": "Сила цикла",
            "description": "Используй циклы для оптимизации кода",
            "narrative": """
Исследователь, пришло время узнать о циклах!

Вместо того чтобы писать "вперед" много раз, можно использовать:
нц 5 раз
  вперед
кц

Это выполнит команду "вперед" 5 раз подряд.
Используй циклы, чтобы сделать код короче!
""",
            "order": 3,
            "difficulty": 3,
            "map_data": {
                "width": 8,
                "height": 4,
                "cells": [
                    ["empty", "start", "empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "finish", "empty"]
                ]
            },
            "golden_code": "нц 6 раз\n  вперед\nкц\nнаправо\nнц 2 раз\n  вперед\nкц",
            "golden_steps_count": 8
        },
        {
            "title": "Зигзаг по коридору",
            "description": "Тренируемся сочетать повороты и движения",
            "narrative": """
Перед тобой длинный коридор с поворотами.

Попробуй сначала решить задачу без циклов, а затем — сократить код.
Главное — довести робота до финиша, не врезавшись в стены.
""",
            "order": 4,
            "difficulty": 2,
            "map_data": {
                "width": 7,
                "height": 5,
                "cells": [
                    ["empty", "empty",   "empty",  "empty",  "empty",  "empty",  "empty"],
                    ["empty", "start",   "empty",  "wall",   "empty",  "empty",  "empty"],
                    ["empty", "empty",   "empty",  "wall",   "empty",  "wall",   "empty"],
                    ["empty", "wall",    "empty",  "empty",  "empty",  "wall",   "empty"],
                    ["empty", "empty",   "empty",  "empty",  "finish", "empty",  "empty"],
                ]
            },
            # оптимальный маршрут: вправо, вправо, вниз, вниз, вправо, вправо
            "golden_code": "направо\nвперед\nвперед\nналево\nвперед\nвперед\nнаправо\nвперед\nвперед",
            "golden_steps_count": 9
        },
        {
            "title": "Два цикла лучше одного",
            "description": "Разбей путь на несколько повторяющихся фрагментов",
            "narrative": """
Иногда путь до финиша состоит из повторяющихся кусков.

Попробуй сначала описать маршрут словами, а затем выделить в нём повторяющиеся части
и оформить их в отдельные циклы.
""",
            "order": 5,
            "difficulty": 3,
            "map_data": {
                "width": 9,
                "height": 5,
                "cells": [
                    ["empty", "start", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "wall",  "empty", "wall",  "empty", "wall",  "empty", "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "finish","empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty","empty"],
                ]
            },
            # идущий вправо с обходом «столбиков» по одному шагу вниз-вверх
            "golden_code": "нц 2 раз\n  вперед\nкц\nнаправо\nвперед\nналево\nнц 3 раз\n  вперед\nкц\nнаправо\nвперед\nналево\nнц 2 раз\n  вперед\nкц",
            "golden_steps_count": 14
        },
        {
            "title": "Узкий мост",
            "description": "Сложность 4 — требовательный маршрут без циклов",
            "narrative": """
Ты подходишь к узкому мосту над цифровой бездной.

Любая ошибка в повороте — и робот падает вниз.
Сконцентрируйся и проведи его по единственному безопасному пути.
""",
            "order": 6,
            "difficulty": 4,
            "map_data": {
                "width": 7,
                "height": 7,
                "cells": [
                    ["empty", "empty",  "empty",  "empty",   "empty",  "empty",  "empty"],
                    ["empty", "start",  "empty",  "wall",    "wall",   "wall",   "empty"],
                    ["empty", "empty",  "empty",  "wall",    "empty",  "empty",  "empty"],
                    ["empty", "wall",   "empty",  "wall",    "empty",  "wall",   "empty"],
                    ["empty", "wall",   "empty",  "empty",   "empty",  "wall",   "empty"],
                    ["empty", "wall",   "wall",   "wall",    "empty",  "wall",   "empty"],
                    ["empty", "empty",  "empty",  "empty",   "finish", "empty",  "empty"],
                ]
            },
            "golden_code": "вперед\nвперед\nнаправо\nвперед\nналево\nвперед\nвперед\nнаправо\nвперед\nналево\nвперед",
            "golden_steps_count": 11
        },
        {
            "title": "Лабиринт наставника",
            "description": "Сложность 5 — серьёзный вызов для опытных игроков",
            "narrative": """
Этот уровень придумал один из наставников платформы.

Чтобы пройти его оптимально, тебе придётся комбинировать циклы,
заранее планировать маршрут и следить за количеством шагов.
Если пройдёшь хотя бы до финиша — уже достижение, но попробуй дотянуться до эталона!
""",
            "order": 7,
            "difficulty": 5,
            "map_data": {
                "width": 10,
                "height": 7,
                "cells": [
                    ["empty", "start", "empty", "empty", "wall",  "empty", "empty", "empty", "empty", "empty"],
                    ["empty", "empty", "wall",  "empty", "wall",  "empty", "wall",  "wall",  "wall",  "empty"],
                    ["empty", "empty", "wall",  "empty", "empty", "empty", "empty", "empty", "wall",  "empty"],
                    ["empty", "empty", "wall",  "wall",  "wall",  "wall",  "empty", "empty", "wall",  "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "wall",  "empty", "empty", "wall",  "empty"],
                    ["empty", "wall",  "wall",  "wall",  "empty", "wall",  "empty", "wall",  "wall",  "empty"],
                    ["empty", "empty", "empty", "empty", "empty", "empty", "empty", "empty", "finish","empty"],
                ]
            },
            # эталонный маршрут с циклами; число шагов приблизительное, важно только соотношение
            "golden_code": "нц 3 раз\n  вперед\nкц\nнаправо\nвперед\nналево\nнц 2 раз\n  вперед\nкц\nнаправо\nнц 4 раз\n  вперед\nкц\nналево\nнц 3 раз\n  вперед\nкц",
            "golden_steps_count": 20
        },
    ]
    
    for level_data in levels:
        existing = db.query(Level).filter(Level.order == level_data["order"]).first()
        if not existing:
            level = Level(**level_data)
            db.add(level)
    
    db.commit()
    print(f"✓ Создано {len(levels)} уровней")


def seed_news(db):
    """Create sample news"""
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    
    if not admin:
        print("! Не найден администратор. Создайте админа сначала.")
        return
    
    news_items = [
        {
            "title": "Добро пожаловать в Алгоритмический Робот!",
            "content": """
Приветствуем вас на образовательной платформе для изучения программирования!

Здесь вы научитесь:
- Основам алгоритмического мышления
- Программированию на языке Кумир
- Решению логических задач

Начните с первого уровня и постепенно продвигайтесь вперёд!
""",
            "author_id": admin.id,
            "is_published": True
        },
        {
            "title": "Советы новичкам",
            "content": """
1. Внимательно читайте предысторию каждого уровня
2. Используйте маркер для выделения важной информации
3. Делайте заметки в дневнике
4. Не бойтесь экспериментировать с кодом
5. Обсуждайте решения в чате, но не публикуйте готовый код без тега [spoiler]

Удачи в прохождении!
""",
            "author_id": admin.id,
            "is_published": True
        }
    ]
    
    for news_data in news_items:
        existing = db.query(News).filter(News.title == news_data["title"]).first()
        if not existing:
            news = News(**news_data)
            db.add(news)
    
    db.commit()
    print(f"✓ Создано {len(news_items)} новостей")


def main():
    db = SessionLocal()
    
    try:
        print("Заполнение базы данных тестовыми данными...")
        seed_levels(db)
        seed_news(db)
        print("\n✓ База данных успешно заполнена!")
    except Exception as e:
        print(f"Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
