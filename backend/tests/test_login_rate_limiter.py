"""Tests unitaires sur LoginRateLimiter — aucune dépendance DB/HTTP."""

from security import LoginRateLimiter


def test_no_lockout_below_first_threshold():
    limiter = LoginRateLimiter()
    for _ in range(2):
        limiter.record_failure("1.2.3.4")
    assert limiter.check("1.2.3.4") == 0


def test_lockout_at_3_failures():
    limiter = LoginRateLimiter()
    for _ in range(3):
        limiter.record_failure("1.2.3.4")
    assert limiter.check("1.2.3.4") > 0
    assert limiter.check("1.2.3.4") <= 30


def test_free_retry_once_lockout_window_has_expired(monkeypatch):
    """Une fois le blocage du palier 3 expiré (30s), un 4e échec ne relance pas
    de blocage — le palier suivant est à 6. (Notez que record_failure() seul
    n'implémente pas le blocage immédiat : c'est login() qui appelle check()
    AVANT de traiter la tentative, donc en usage réel un 4e essai pendant les
    30s est rejeté en 429 sans jamais atteindre record_failure.)"""
    fake_time = [1000.0]
    monkeypatch.setattr("security.time.monotonic", lambda: fake_time[0])

    limiter = LoginRateLimiter()
    for _ in range(3):
        limiter.record_failure("1.2.3.4")
    assert limiter.check("1.2.3.4") > 0

    fake_time[0] += 31  # le blocage de 30s est passé
    assert limiter.check("1.2.3.4") == 0

    limiter.record_failure("1.2.3.4")  # 4e échec — pas un palier
    assert limiter.check("1.2.3.4") == 0


def test_lockout_at_6_failures_is_5_minutes():
    limiter = LoginRateLimiter()
    for _ in range(6):
        limiter.record_failure("1.2.3.4")
    wait = limiter.check("1.2.3.4")
    assert 0 < wait <= 300


def test_lockout_at_9_failures_is_15_minutes():
    limiter = LoginRateLimiter()
    for _ in range(9):
        limiter.record_failure("1.2.3.4")
    wait = limiter.check("1.2.3.4")
    assert 0 < wait <= 900


def test_lockout_at_12_plus_failures_is_1_hour_and_stays_locked():
    limiter = LoginRateLimiter()
    for _ in range(12):
        limiter.record_failure("1.2.3.4")
    wait = limiter.check("1.2.3.4")
    assert 0 < wait <= 3600

    # Continuer à échouer au-delà de 12 doit garder le verrouillage à 1h
    for _ in range(3):
        limiter.record_failure("1.2.3.4")
    assert limiter.check("1.2.3.4") > 0


def test_success_resets_failure_count():
    limiter = LoginRateLimiter()
    for _ in range(2):
        limiter.record_failure("1.2.3.4")
    limiter.record_success("1.2.3.4")
    assert limiter.check("1.2.3.4") == 0
    # Après reset, il faut de nouveau 3 échecs pour se faire bloquer
    for _ in range(2):
        limiter.record_failure("1.2.3.4")
    assert limiter.check("1.2.3.4") == 0


def test_different_ips_are_tracked_independently():
    limiter = LoginRateLimiter()
    for _ in range(3):
        limiter.record_failure("1.1.1.1")
    assert limiter.check("1.1.1.1") > 0
    assert limiter.check("2.2.2.2") == 0


def test_reset_clears_all_ips():
    limiter = LoginRateLimiter()
    for _ in range(3):
        limiter.record_failure("1.1.1.1")
    limiter.reset()
    assert limiter.check("1.1.1.1") == 0
