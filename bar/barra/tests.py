from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from . import reportes, services
from .models import Categoria, Cliente, Factura, Mesa, Movimiento, Producto
from .services import CuentaError


class Base(TestCase):
    def setUp(self):
        self.cat = Categoria.objects.create(nombre="Cervezas")
        self.aguila = Producto.objects.create(
            categoria=self.cat, nombre="Águila", precio=6000, costo=3300, stock=10, stock_minimo=3
        )
        self.mojito = Producto.objects.create(
            categoria=self.cat, nombre="Mojito", precio=18000, costo=6500, controla_stock=False
        )
        self.mesa = Mesa.objects.create(nombre="Mesa 1")
        self.mesa2 = Mesa.objects.create(nombre="Mesa 2")

    def stock(self, producto):
        producto.refresh_from_db()
        return producto.stock


class CuentaTests(Base):
    def test_primer_producto_abre_la_cuenta_y_descuenta_stock(self):
        services.agregar(self.mesa, self.aguila.pk)
        services.agregar(self.mesa, self.aguila.pk)
        factura = services.factura_abierta(self.mesa)
        self.assertEqual(factura.n_items, 2)
        self.assertEqual(factura.total, 12000)
        self.assertEqual(self.stock(self.aguila), 8)

    def test_producto_sin_control_de_stock_no_descuenta(self):
        services.agregar(self.mesa, self.mojito.pk)
        self.assertEqual(self.stock(self.mojito), 0)

    def test_producto_inactivo_se_ignora(self):
        Producto.objects.filter(pk=self.aguila.pk).update(activo=False)
        services.agregar(self.mesa, self.aguila.pk)
        self.assertIsNone(services.factura_abierta(self.mesa))

    def test_se_puede_vender_con_stock_en_cero(self):
        # El conteo puede estar desactualizado: nunca se frena una venta por eso.
        Producto.objects.filter(pk=self.aguila.pk).update(stock=0)
        services.agregar(self.mesa, self.aguila.pk)
        self.assertEqual(self.stock(self.aguila), -1)
        self.assertTrue(Producto.objects.get(pk=self.aguila.pk).agotado)

    def test_quitar_devuelve_stock_y_cuenta_vacia_libera_la_mesa(self):
        services.agregar(self.mesa, self.aguila.pk)
        services.agregar(self.mesa, self.aguila.pk)
        services.quitar(self.mesa, self.aguila.pk)
        self.assertEqual(services.factura_abierta(self.mesa).n_items, 1)
        self.assertEqual(self.stock(self.aguila), 9)
        services.quitar(self.mesa, self.aguila.pk)
        self.assertIsNone(services.factura_abierta(self.mesa))
        self.assertEqual(Factura.objects.count(), 0)
        self.assertEqual(self.stock(self.aguila), 10)

    def test_quitar_algo_que_ya_no_esta_no_falla(self):
        services.quitar(self.mesa, self.aguila.pk)  # sin cuenta
        services.agregar(self.mesa, self.mojito.pk)
        services.quitar(self.mesa, self.aguila.pk)  # cuenta sin ese producto
        self.assertEqual(self.stock(self.aguila), 10)

    def test_precio_queda_fijo_aunque_el_producto_cambie(self):
        services.agregar(self.mesa, self.aguila.pk)
        Producto.objects.filter(pk=self.aguila.pk).update(precio=9000, costo=5000)
        factura = services.factura_abierta(self.mesa)
        linea = factura.lineas.get()
        self.assertEqual((linea.precio, linea.costo), (6000, 3300))

    def test_una_sola_cuenta_abierta_por_mesa(self):
        Factura.objects.create(mesa=self.mesa)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Factura.objects.create(mesa=self.mesa)
        Factura.objects.create(mesa=self.mesa2)  # otra mesa sí puede

    def test_cliente_anonimo_por_defecto_y_asignable(self):
        services.agregar(self.mesa, self.aguila.pk)
        self.assertIsNone(services.factura_abierta(self.mesa).cliente)
        carlos = Cliente.objects.create(nombre="Carlos")
        services.asignar_cliente(self.mesa, carlos.pk)
        self.assertEqual(services.factura_abierta(self.mesa).cliente, carlos)
        services.asignar_cliente(self.mesa, None)
        self.assertIsNone(services.factura_abierta(self.mesa).cliente)

    def test_crear_cliente_desde_la_mesa_reutiliza_el_mismo_nombre(self):
        services.agregar(self.mesa, self.aguila.pk)
        services.crear_cliente(self.mesa, "  Laura ")
        services.crear_cliente(self.mesa, "Laura")
        self.assertEqual(Cliente.objects.filter(nombre="Laura").count(), 1)
        self.assertEqual(services.factura_abierta(self.mesa).cliente.nombre, "Laura")

    def test_cobrar_numera_consecutivo_y_libera_la_mesa(self):
        services.agregar(self.mesa, self.aguila.pk)
        primera = services.cobrar(self.mesa, "efectivo")
        services.agregar(self.mesa, self.aguila.pk)
        segunda = services.cobrar(self.mesa, "tarjeta")
        self.assertEqual((primera.numero, segunda.numero), (1, 2))
        self.assertEqual(primera.estado, Factura.Estado.PAGADA)
        self.assertIsNotNone(primera.cerrada_en)
        self.assertIsNone(services.factura_abierta(self.mesa))

    def test_cobrar_exige_metodo_valido_y_cuenta_con_productos(self):
        with self.assertRaises(CuentaError):
            services.cobrar(self.mesa, "efectivo")  # vacía
        services.agregar(self.mesa, self.aguila.pk)
        with self.assertRaises(CuentaError):
            services.cobrar(self.mesa, "cheque")
        self.assertTrue(services.factura_abierta(self.mesa).abierta)

    def test_cobrar_dos_veces_la_misma_mesa_solo_cobra_una(self):
        # Dos meseros tocan «cobrar» casi a la vez: el segundo ya no encuentra cuenta.
        services.agregar(self.mesa, self.aguila.pk)
        services.cobrar(self.mesa, "efectivo")
        with self.assertRaises(CuentaError):
            services.cobrar(self.mesa, "efectivo")
        self.assertEqual(Factura.objects.filter(estado="pagada").count(), 1)

    def test_anular_devuelve_todo_el_stock_y_conserva_el_registro(self):
        services.agregar(self.mesa, self.aguila.pk)
        services.agregar(self.mesa, self.aguila.pk)
        services.agregar(self.mesa, self.mojito.pk)
        services.anular(self.mesa)
        self.assertEqual(self.stock(self.aguila), 10)
        self.assertIsNone(services.factura_abierta(self.mesa))
        self.assertEqual(Factura.objects.get().estado, Factura.Estado.ANULADA)

    def test_anular_cuenta_sin_productos_no_deja_rastro(self):
        services.asignar_cliente(self.mesa, None)  # abre una cuenta vacía
        services.anular(self.mesa)
        self.assertEqual(Factura.objects.count(), 0)


class InventarioTests(Base):
    def test_compra_suma_stock_y_actualiza_costo(self):
        services.comprar(self.aguila, 24, costo=3500, nota="Distribuidora")
        self.aguila.refresh_from_db()
        self.assertEqual((self.aguila.stock, self.aguila.costo), (34, 3500))
        mov = Movimiento.objects.get()
        self.assertEqual((mov.motivo, mov.cantidad, mov.costo_unitario), ("compra", 24, 3500))

    def test_compra_sin_costo_no_toca_el_costo(self):
        services.comprar(self.aguila, 5)
        self.aguila.refresh_from_db()
        self.assertEqual(self.aguila.costo, 3300)

    def test_compra_no_acepta_cantidad_cero_o_negativa(self):
        for cantidad in (0, -3):
            with self.assertRaises(CuentaError):
                services.comprar(self.aguila, cantidad)

    def test_conteo_fija_el_stock_y_guarda_la_diferencia(self):
        services.contar(self.aguila, 7)
        self.assertEqual(self.stock(self.aguila), 7)
        mov = Movimiento.objects.get()
        self.assertEqual((mov.motivo, mov.cantidad), ("ajuste", -3))

    def test_conteo_igual_al_actual_no_genera_movimiento(self):
        services.contar(self.aguila, 10)
        self.assertEqual(Movimiento.objects.count(), 0)

    def test_alerta_de_stock_bajo(self):
        self.assertFalse(self.aguila.stock_bajo)
        Producto.objects.filter(pk=self.aguila.pk).update(stock=3)
        self.assertTrue(Producto.objects.get(pk=self.aguila.pk).stock_bajo)
        self.assertFalse(self.mojito.stock_bajo)


@override_settings(HORA_CORTE_JORNADA=6)
class ReportesTests(Base):
    def cobrada(self, cerrada_en, metodo="efectivo", **pedido):
        """Crea una factura pagada en el instante dado, con {producto: cantidad}."""
        mesa = pedido.pop("mesa", self.mesa)
        factura = Factura.objects.create(
            mesa=mesa,
            estado=Factura.Estado.PAGADA,
            metodo_pago=metodo,
            cerrada_en=cerrada_en,
            numero=(Factura.objects.count() + 1),
        )
        for producto, cantidad in (pedido.get("items") or {self.aguila: 1}).items():
            factura.lineas.create(
                producto=producto, cantidad=cantidad, precio=producto.precio, costo=producto.costo
            )
        return factura

    def hora(self, dia, hh, mm=0):
        return datetime(
            dia.year, dia.month, dia.day, hh, mm, tzinfo=timezone.get_current_timezone()
        )

    def test_la_jornada_cruza_la_medianoche(self):
        lunes = date(2026, 3, 2)
        self.assertEqual(reportes.jornada_de(self.hora(lunes, 22)), lunes)
        self.assertEqual(reportes.jornada_de(self.hora(lunes + timedelta(days=1), 2)), lunes)
        self.assertEqual(
            reportes.jornada_de(self.hora(lunes + timedelta(days=1), 6)), lunes + timedelta(days=1)
        )

    def test_resumen_de_la_jornada(self):
        lunes = date(2026, 3, 2)
        martes = lunes + timedelta(days=1)
        self.cobrada(self.hora(lunes, 21), "efectivo", items={self.aguila: 3, self.mojito: 1})
        self.cobrada(
            self.hora(martes, 1), "tarjeta", items={self.aguila: 2}
        )  # madrugada: sigue siendo lunes
        self.cobrada(self.hora(martes, 8), "efectivo", items={self.aguila: 5})  # otra jornada
        r = reportes.resumen(lunes)
        self.assertEqual(r["n_facturas"], 2)
        self.assertEqual(r["venta"], 3 * 6000 + 18000 + 2 * 6000)
        self.assertEqual(r["costo"], 3 * 3300 + 6500 + 2 * 3300)
        self.assertEqual(r["ganancia"], r["venta"] - r["costo"])
        self.assertEqual(r["ticket_promedio"], r["venta"] // 2)
        por_metodo = {m["nombre"]: m["total"] for m in r["metodos"]}
        self.assertEqual(por_metodo["Efectivo"], 3 * 6000 + 18000)
        self.assertEqual(por_metodo["Tarjeta"], 12000)
        self.assertEqual(r["productos"][0]["producto__nombre"], "Águila")
        self.assertEqual(r["productos"][0]["unidades"], 5)

    def test_anuladas_y_abiertas_no_cuentan_como_venta(self):
        lunes = date(2026, 3, 2)
        services.agregar(self.mesa, self.aguila.pk)  # abierta
        Factura.objects.create(mesa=self.mesa2, estado="anulada", cerrada_en=self.hora(lunes, 21))
        r = reportes.resumen(lunes)
        self.assertEqual((r["n_facturas"], r["venta"], r["ticket_promedio"]), (0, 0, 0))

    def test_cuentas_abiertas_lista_lo_pendiente(self):
        services.agregar(self.mesa, self.aguila.pk)
        self.assertEqual([f.mesa for f in reportes.cuentas_abiertas()], [self.mesa])


class VistasTests(Base):
    def accion(self, mesa=None, **datos):
        return self.client.post(reverse("cuenta_accion", args=[(mesa or self.mesa).pk]), datos)

    def test_pantallas_cargan(self):
        for nombre, args in [
            ("mesas", []),
            ("mesas_panel", []),
            ("inventario", []),
            ("ventas", []),
            ("cuenta", [self.mesa.pk]),
            ("cuenta_panel", [self.mesa.pk]),
        ]:
            with self.subTest(pantalla=nombre):
                self.assertEqual(self.client.get(reverse(nombre, args=args)).status_code, 200)

    def test_pantallas_cargan_vacias(self):
        Mesa.objects.all().delete()
        Producto.objects.all().delete()
        for nombre in ("mesas", "inventario", "ventas"):
            self.assertEqual(self.client.get(reverse(nombre)).status_code, 200)

    def test_flujo_completo_de_una_mesa(self):
        r = self.accion(accion="agregar", producto=self.aguila.pk)
        self.assertContains(r, "$6.000")
        self.accion(accion="agregar", producto=self.aguila.pk)
        r = self.accion(accion="agregar", producto=self.mojito.pk)
        self.assertContains(r, "$30.000")
        self.assertContains(self.client.get(reverse("mesas")), "$30.000")

        r = self.accion(accion="cobrar", metodo="transferencia")
        factura = Factura.objects.get()
        self.assertEqual(r.json(), {"ir": reverse("factura", args=[factura.pk])})
        self.assertEqual(factura.total, 30000)
        self.assertContains(self.client.get(reverse("factura", args=[factura.pk])), "Factura N.º 1")
        self.assertContains(self.client.get(reverse("ventas")), "$30.000")

    def test_cobrar_cuenta_vacia_muestra_aviso_sin_error(self):
        r = self.accion(accion="cobrar", metodo="efectivo")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "vacía")

    def test_anular_vuelve_a_mesas(self):
        self.accion(accion="agregar", producto=self.aguila.pk)
        r = self.accion(accion="anular")
        self.assertEqual(r.json(), {"ir": reverse("mesas")})
        self.assertEqual(self.stock(self.aguila), 10)

    def test_datos_basura_no_rompen(self):
        for datos in (
            {},
            {"accion": "agregar"},
            {"accion": "agregar", "producto": "x"},
            {"accion": "agregar", "producto": "99999"},
            {"accion": "inventada"},
        ):
            with self.subTest(datos=datos):
                self.assertEqual(self.accion(**datos).status_code, 200)
        self.assertEqual(self.client.post(reverse("cuenta_accion", args=[9999])).status_code, 404)

    def test_las_acciones_exigen_post(self):
        self.assertEqual(
            self.client.get(reverse("cuenta_accion", args=[self.mesa.pk])).status_code, 405
        )

    def test_inventario_compra_y_conteo(self):
        url = reverse("inventario_mover")
        self.client.post(
            url, {"producto": self.aguila.pk, "tipo": "compra", "cantidad": "12", "costo": "3600"}
        )
        self.assertEqual(self.stock(self.aguila), 22)
        self.client.post(url, {"producto": self.aguila.pk, "tipo": "conteo", "cantidad": "20"})
        self.assertEqual(self.stock(self.aguila), 20)

    def test_inventario_rechaza_cantidades_invalidas(self):
        url = reverse("inventario_mover")
        for datos in (
            {"tipo": "compra", "cantidad": ""},
            {"tipo": "compra", "cantidad": "-5"},
            {"tipo": "conteo", "cantidad": "-1"},
            {"tipo": "compra", "cantidad": "abc"},
        ):
            with self.subTest(datos=datos):
                r = self.client.post(url, {"producto": self.aguila.pk, **datos}, follow=True)
                self.assertEqual(r.status_code, 200)
        self.assertEqual(self.stock(self.aguila), 10)
        self.assertEqual(Movimiento.objects.count(), 0)

    def test_catalogo_ordenado_alfabeticamente_sin_importar_tildes(self):
        Producto.objects.create(categoria=self.cat, nombre="Poker", precio=5500)
        r = self.client.get(reverse("cuenta_panel", args=[self.mesa.pk]))
        self.assertEqual([p.nombre for p in r.context["productos"]], ["Águila", "Mojito", "Poker"])

    def test_ventas_con_fecha_invalida_usa_hoy(self):
        self.assertEqual(
            self.client.get(reverse("ventas"), {"fecha": "no-es-fecha"}).status_code, 200
        )


class AdminYComandosTests(Base):
    def test_admin_del_dueno_carga_todas_las_pantallas(self):
        dueno = get_user_model().objects.create_superuser("dueno", password="x")
        self.client.force_login(dueno)
        services.agregar(self.mesa, self.aguila.pk)
        factura = services.cobrar(self.mesa, "efectivo")
        services.comprar(self.aguila, 5)
        for modelo in ("categoria", "producto", "mesa", "cliente", "factura", "movimiento"):
            with self.subTest(modelo=modelo):
                self.assertEqual(self.client.get(f"/admin/barra/{modelo}/").status_code, 200)
        self.assertEqual(
            self.client.get(f"/admin/barra/factura/{factura.pk}/change/").status_code, 200
        )
        self.assertEqual(self.client.get("/admin/barra/producto/add/").status_code, 200)
        self.assertEqual(
            self.client.get(f"/admin/barra/producto/{self.aguila.pk}/change/").status_code, 200
        )

    def test_el_stock_solo_se_edita_al_crear_el_producto(self):
        dueno = get_user_model().objects.create_superuser("dueno", password="x")
        self.client.force_login(dueno)
        r = self.client.get(f"/admin/barra/producto/{self.aguila.pk}/change/")
        self.assertNotIn('name="stock"', r.content.decode())
        r = self.client.get("/admin/barra/producto/add/")
        self.assertIn('name="stock"', r.content.decode())

    def test_cargar_demo_se_puede_repetir_sin_duplicar(self):
        call_command("cargar_demo", verbosity=0)
        antes = (Producto.objects.count(), Mesa.objects.count(), Categoria.objects.count())
        call_command("cargar_demo", verbosity=0)
        self.assertEqual(
            antes, (Producto.objects.count(), Mesa.objects.count(), Categoria.objects.count())
        )
