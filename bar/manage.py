"""Utilidad de línea de comandos de Django para el control del bar."""

import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bar_web.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
