from django.urls import path

from . import views

urlpatterns = [
    path("", views.mesas, name="mesas"),
    path("mesas/panel/", views.mesas_panel, name="mesas_panel"),
    path("mesa/<int:mesa_id>/", views.cuenta, name="cuenta"),
    path("mesa/<int:mesa_id>/panel/", views.cuenta_panel, name="cuenta_panel"),
    path("mesa/<int:mesa_id>/accion/", views.cuenta_accion, name="cuenta_accion"),
    path("inventario/", views.inventario, name="inventario"),
    path("inventario/mover/", views.inventario_mover, name="inventario_mover"),
    path("ventas/", views.ventas, name="ventas"),
    path("factura/<int:factura_id>/", views.factura, name="factura"),
]
