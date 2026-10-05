from django import template

register = template.Library()


@register.filter
def pesos(valor) -> str:
    """12000 → «$12.000» (separador de miles a la colombiana)."""
    n = int(valor or 0)
    signo = "-" if n < 0 else ""
    return f"{signo}${abs(n):,}".replace(",", ".")
