"""Carga un catálogo de ejemplo para probar el bar. Se puede repetir sin duplicar nada.

    python manage.py cargar_demo

Los precios y costos son inventados: cámbialos en «administración» (o bórralos y carga los tuyos).
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from barra.models import Categoria, Cliente, Mesa, Producto

# categoría → [(nombre, precio, costo, stock, stock_minimo)]  · stock None = no se cuenta por unidad
CATALOGO = {
    "Cervezas": [
        ("Águila", 6000, 3300, 48, 12),
        ("Club Colombia", 7000, 3900, 36, 12),
        ("Corona", 9000, 5200, 24, 6),
        ("Poker", 5500, 3000, 48, 12),
    ],
    "Licores": [
        ("Aguardiente — trago", 4000, 1500, None, 0),
        ("Aguardiente — botella", 65000, 38000, 10, 3),
        ("Ron — botella", 85000, 52000, 8, 2),
        ("Whisky — trago", 12000, 5000, None, 0),
    ],
    "Cócteles": [
        ("Mojito", 18000, 6500, None, 0),
        ("Michelada", 12000, 4500, None, 0),
        ("Piña colada", 20000, 7000, None, 0),
    ],
    "Sin alcohol": [
        ("Gaseosa", 4000, 1800, 30, 10),
        ("Agua", 3000, 1000, 40, 10),
        ("Jugo natural", 7000, 2500, None, 0),
    ],
    "Comida": [
        ("Papas fritas", 10000, 3500, None, 0),
        ("Nachos", 16000, 6000, None, 0),
        ("Empanadas (3)", 9000, 3000, None, 0),
    ],
}


class Command(BaseCommand):
    help = "Carga categorías, productos, mesas y clientes de ejemplo."

    @transaction.atomic
    def handle(self, *args, **opciones):
        for orden, (nombre_cat, productos) in enumerate(CATALOGO.items(), start=1):
            categoria, _ = Categoria.objects.get_or_create(
                nombre=nombre_cat, defaults={"orden": orden}
            )
            for nombre, precio, costo, stock, minimo in productos:
                Producto.objects.get_or_create(
                    categoria=categoria,
                    nombre=nombre,
                    defaults={
                        "precio": precio,
                        "costo": costo,
                        "controla_stock": stock is not None,
                        "stock": stock or 0,
                        "stock_minimo": minimo,
                    },
                )
        for n in range(1, 9):
            Mesa.objects.get_or_create(nombre=f"Mesa {n}", defaults={"orden": n})
        Mesa.objects.get_or_create(nombre="Barra", defaults={"orden": 0})
        Cliente.objects.get_or_create(nombre="Carlos (cliente frecuente)")
        self.stdout.write(self.style.SUCCESS("Datos de ejemplo cargados."))
