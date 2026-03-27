"""
Simple admin creation script using bcrypt directly.

Usage:
  python scripts/create_admin_simple.py              # создать админа, если ещё нет
  python scripts/create_admin_simple.py --reset      # сбросить пароль admin@botstory.com на admin
"""
import argparse
import sys

sys.path.append(".")

import bcrypt

from app.db.database import SessionLocal
from app.db.models import User, UserRole

ADMIN_EMAIL = "admin@botstory.com"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin"


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_admin(*, reset_password: bool = False) -> None:
    db = SessionLocal()

    try:
        by_email = db.query(User).filter(User.email.ilike(ADMIN_EMAIL)).first()

        if reset_password and by_email:
            by_email.password_hash = _hash_password(ADMIN_PASSWORD)
            by_email.role = UserRole.ADMIN
            by_email.is_active = True
            db.commit()
            print("✓ Пароль администратора сброшен.")
            print(f"  Email: {ADMIN_EMAIL}")
            print(f"  Password: {ADMIN_PASSWORD}")
            return

        admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        if admin and not reset_password:
            print(f"Admin user already exists: {admin.email}")
            print("  Чтобы сбросить пароль: python scripts/create_admin_simple.py --reset")
            return

        if by_email and not reset_password:
            print(f"Пользователь {ADMIN_EMAIL} уже есть (не роль admin). Используйте --reset для сброса пароля.")
            return

        password_hash = _hash_password(ADMIN_PASSWORD)
        admin_user = User(
            email=ADMIN_EMAIL,
            username=ADMIN_USERNAME,
            password_hash=password_hash,
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin_user)
        db.commit()

        print("✓ Admin user created successfully!")
        print(f"  Email: {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print("  Please change the password after first login!")

    except Exception as e:
        print(f"Error creating admin: {e}")
        db.rollback()

    finally:
        db.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Create or reset default admin user")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Сбросить пароль для admin@botstory.com на admin и выставить роль admin",
    )
    args = p.parse_args()
    create_admin(reset_password=args.reset)
