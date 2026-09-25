"""La copia del esquema que muestra la demo (`demo/esquema.py`) coincide con los modelos de Django."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

django = pytest.importorskip("django")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web"))
sys.path.insert(0, str(ROOT / "demo"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "centinela_web.settings")
django.setup()

from django.apps import apps
from django.db import models
from esquema import CASCADA, PROTEGIDO, TABLAS, VACIO

MODELOS = {m._meta.db_table: m for m in apps.get_models()}
AL_BORRAR = {models.CASCADE: CASCADA, models.PROTECT: PROTEGIDO, models.SET_NULL: VACIO}


def _tipo(f: models.Field) -> str:
    if f.is_relation or isinstance(f, models.AutoField | models.BigAutoField):
        return "entero"
    if isinstance(f, models.PositiveIntegerField):
        return "entero ≥ 0"
    if isinstance(f, models.DecimalField):
        return f"decimal({f.max_digits},{f.decimal_places})"
    if isinstance(f, models.CharField | models.FileField):
        return f"varchar({f.max_length})"
    tipos = [
        (models.TextField, "texto"),
        (models.BooleanField, "bool"),
        (models.DateTimeField, "fecha-hora"),
        (models.DateField, "fecha"),
        (models.FloatField, "real"),
        (models.JSONField, "JSON"),
    ]
    return next(nombre for clase, nombre in tipos if isinstance(f, clase))


@pytest.mark.parametrize("tabla", TABLAS, ids=lambda t: t.tabla)
def test_tabla_coincide_con_el_modelo(tabla):
    modelo = MODELOS[tabla.tabla]
    reales = {f.column: f for f in modelo._meta.concrete_fields}
    copia = {c.nombre: c for c in tabla.campos}

    if tabla.externa:
        assert set(copia) <= set(reales)
    else:
        assert set(copia) == set(reales)

    for nombre, c in copia.items():
        f = reales[nombre]
        claves = set(c.clave.split())
        assert c.tipo == _tipo(f), nombre
        assert c.nulo == f.null, nombre
        assert ("PK" in claves) == f.primary_key, nombre
        assert ("UQ" in claves) == (f.unique and not f.primary_key), nombre
        assert ("FK" in claves) == f.is_relation, nombre
        if f.is_relation:
            assert c.ref == f.related_model._meta.db_table, nombre
            assert c.al_borrar == AL_BORRAR[f.remote_field.on_delete], nombre

    unicos = {
        tuple(modelo._meta.get_field(n).column for n in r.fields)
        for r in modelo._meta.constraints
        if isinstance(r, models.UniqueConstraint)
    }
    assert set(tabla.unicos) == unicos


def test_estan_todos_los_modelos_del_registro():
    propios = {t for t, m in MODELOS.items() if m._meta.app_label == "campo"}
    assert propios <= {t.tabla for t in TABLAS}
