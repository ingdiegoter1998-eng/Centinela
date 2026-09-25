from campo import views
from django.conf import settings
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path("", views.tablero, name="tablero"),
    path("lotes/<int:pk>/", views.lote, name="lote"),
    path("admin/", admin.site.urls),
    # Las fotos de las fincas solo se ven con sesión iniciada, también en producción.
    path(f"{settings.MEDIA_URL.lstrip('/')}<path:path>", views.foto, name="foto"),
]
