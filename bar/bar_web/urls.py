from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Bar — administración"
admin.site.site_title = "Bar"
admin.site.index_title = "Catálogo, mesas y clientes"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("barra.urls")),
]
