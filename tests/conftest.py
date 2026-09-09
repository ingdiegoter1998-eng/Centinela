import pytest

from centinela_core.synthetic import make_orchard


@pytest.fixture
def orchard_small():
    """5x5 huerto bien separado, sombras y ruido. GT exacto."""
    return make_orchard(n_rows=5, n_cols=5, spacing=64, crown_radius=17, seed=1)


@pytest.fixture
def orchard_medium():
    """8x10 = 80 árboles — caso principal del test end-to-end."""
    return make_orchard(n_rows=8, n_cols=10, seed=0)
