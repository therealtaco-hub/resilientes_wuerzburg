"""
Unit-Tests für utils/vuln_formula.py.

Ausführen:
    cd backend
    python -m pytest tests/test_vuln_formula.py -v
"""

import math

import pytest

from utils.vuln_formula import N_PRIOR, compute_hvi, shrink_senior_rate


class TestShrinkSeniorRate:
    def test_small_cell_shrinks_strongly_to_global_mean(self):
        # n=3, alle 65+ → Rohwert 1.0; sollte stark zur Stadtmittelrate gezogen werden
        result = shrink_senior_rate(observed=1.0, n=3, global_mean=0.2)
        assert result == pytest.approx((3 * 1.0 + 50 * 0.2) / (3 + 50), rel=1e-9)
        assert result < 0.30  # weit unter dem Rohwert von 1.0

    def test_large_cell_stays_close_to_observed(self):
        # n=200, Beobachtung 0.30, Stadtmittel 0.20 → kaum Veränderung
        result = shrink_senior_rate(observed=0.30, n=200, global_mean=0.20)
        expected = (200 * 0.30 + 50 * 0.20) / (200 + 50)
        assert result == pytest.approx(expected, rel=1e-9)
        assert result > 0.27  # deutlich näher an 0.30 als an 0.20

    def test_cell_at_prior_has_half_credibility(self):
        # n == N_PRIOR → adjustierter Wert liegt exakt zwischen observed und global_mean
        result = shrink_senior_rate(observed=0.40, n=N_PRIOR, global_mean=0.20)
        assert result == pytest.approx(0.30, abs=1e-9)  # Mittelwert von 0.40 und 0.20

    def test_cell_matching_global_mean_unchanged(self):
        # Wenn observed == global_mean → immer gleich, egal wie klein n ist
        result = shrink_senior_rate(observed=0.20, n=3, global_mean=0.20)
        assert result == pytest.approx(0.20, abs=1e-9)

    def test_custom_n_prior(self):
        result = shrink_senior_rate(observed=1.0, n=10, global_mean=0.0, n_prior=10)
        assert result == pytest.approx(0.50, abs=1e-9)  # (10*1 + 10*0) / 20

    def test_result_bounded_between_global_mean_and_observed(self):
        for n in [1, 5, 20, 50, 200, 1000]:
            result = shrink_senior_rate(observed=0.8, n=n, global_mean=0.15)
            assert 0.15 <= result <= 0.8


class TestComputeHvi:
    def test_max_inputs_give_10(self):
        hvi = compute_hvi({"lst_norm": 1.0, "anteil_65plus": 1.0})
        assert hvi == pytest.approx(10.0)

    def test_min_inputs_give_1(self):
        hvi = compute_hvi({"lst_norm": 0.0, "anteil_65plus": 0.0})
        assert hvi == pytest.approx(1.0)

    def test_mid_inputs(self):
        hvi = compute_hvi({"lst_norm": 0.5, "anteil_65plus": 0.5})
        assert hvi == pytest.approx(0.5 * 9 + 1)

    def test_weighted_combination(self):
        # 0.6 * 1.0 + 0.4 * 0.0 = 0.6 → 0.6 * 9 + 1 = 6.4
        hvi = compute_hvi({"lst_norm": 1.0, "anteil_65plus": 0.0})
        assert hvi == pytest.approx(6.4)

    def test_none_lst_returns_none(self):
        assert compute_hvi({"lst_norm": None, "anteil_65plus": 0.3}) is None

    def test_none_alt_returns_none(self):
        assert compute_hvi({"lst_norm": 0.5, "anteil_65plus": None}) is None

    def test_nan_lst_returns_none(self):
        assert compute_hvi({"lst_norm": float("nan"), "anteil_65plus": 0.3}) is None

    def test_nan_alt_returns_none(self):
        assert compute_hvi({"lst_norm": 0.5, "anteil_65plus": float("nan")}) is None

    def test_shrunk_small_cell_lower_than_raw(self):
        # Zeigt den Effekt der Shrinkage im Gesamtsystem:
        # Rohwert (3 Personen, alle 65+, heiße Zelle) vs. adjustierter Wert
        global_mean = 0.22
        raw_hvi  = compute_hvi({"lst_norm": 0.9, "anteil_65plus": 1.0})
        adj_rate = shrink_senior_rate(1.0, n=3, global_mean=global_mean)
        adj_hvi  = compute_hvi({"lst_norm": 0.9, "anteil_65plus": adj_rate})
        assert raw_hvi > adj_hvi
        assert raw_hvi == pytest.approx(9.46, abs=1e-9)  # 0.6*0.9 + 0.4*1.0 = 0.94 → 9.46
        assert adj_hvi < raw_hvi - 0.5                   # mit Korrektur: deutlich reduziert
