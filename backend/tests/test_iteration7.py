"""Iteration 7 tests: auto-username, auto-deactivate settings, permission catalog CRUD."""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://open-project-47.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SUPER_EMAIL = "superadmin@yoshitaka.com"
SUPER_PASS = "SuperAdmin2026!"


def _sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def super_sess():
    s = _sess()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    return s


# ---------------- AUTO USERNAME ----------------
class TestAutoUsername:
    def test_auto_username_no_username(self, super_sess):
        created_ids = []
        pattern = re.compile(r"^yoshi-user\d{2,}$")
        try:
            for label in ("Test User A", "Test User B"):
                r = super_sess.post(f"{API}/users", json={
                    "name": label,
                    "password": "testpass123",
                    "role": "student",
                })
                assert r.status_code == 200, f"POST /users failed: {r.status_code} {r.text}"
                data = r.json()
                username = data.get("username") or ""
                assert pattern.match(username), f"Username '{username}' does not match yoshi-userNN pattern"
                created_ids.append((data["id"], username))
            # Second's number must be > first's
            n1 = int(created_ids[0][1].split("yoshi-user")[-1])
            n2 = int(created_ids[1][1].split("yoshi-user")[-1])
            assert n2 > n1, f"Second username '{created_ids[1][1]}' should increment from '{created_ids[0][1]}'"
        finally:
            for uid, _ in created_ids:
                super_sess.delete(f"{API}/users/{uid}")


# ---------------- AUTO DEACTIVATE ----------------
class TestAutoDeactivate:
    def test_get_settings(self, super_sess):
        r = super_sess.get(f"{API}/settings/auto-deactivate")
        assert r.status_code == 200
        d = r.json()
        assert "days" in d and "metric" in d

    def test_put_and_round_trip(self, super_sess):
        original = super_sess.get(f"{API}/settings/auto-deactivate").json()
        try:
            r = super_sess.put(f"{API}/settings/auto-deactivate", json={"days": 60, "metric": "either"})
            assert r.status_code == 200
            assert r.json()["days"] == 60
            assert r.json()["metric"] == "either"
            g = super_sess.get(f"{API}/settings/auto-deactivate").json()
            assert g["days"] == 60 and g["metric"] == "either"
        finally:
            super_sess.put(f"{API}/settings/auto-deactivate",
                           json={"days": int(original.get("days") or 0),
                                 "metric": original.get("metric") or "either"})

    def test_put_invalid_metric(self, super_sess):
        r = super_sess.put(f"{API}/settings/auto-deactivate", json={"days": 60, "metric": "nonsense"})
        assert r.status_code in (400, 422)

    def test_run_disabled(self, super_sess):
        # Ensure days=0 to disable
        super_sess.put(f"{API}/settings/auto-deactivate", json={"days": 0, "metric": "either"})
        r = super_sess.post(f"{API}/settings/auto-deactivate/run")
        assert r.status_code == 200
        d = r.json()
        assert d["deactivated"] == 0
        assert "disabled" in (d.get("note") or "").lower()


# ---------------- PER USER EXEMPT ----------------
class TestUserExempt:
    def test_patch_deactivation_exempt(self, super_sess):
        # Create a throwaway user
        r = super_sess.post(f"{API}/users", json={
            "name": "TEST Exempt", "password": "testpass123", "role": "student",
        })
        assert r.status_code == 200
        uid = r.json()["id"]
        try:
            p = super_sess.patch(f"{API}/users/{uid}", json={"deactivation_exempt": True})
            assert p.status_code == 200
            assert p.json().get("deactivation_exempt") is True
            g = super_sess.get(f"{API}/users/{uid}")
            assert g.json().get("deactivation_exempt") is True
            # flip back
            p2 = super_sess.patch(f"{API}/users/{uid}", json={"deactivation_exempt": False})
            assert p2.status_code == 200
            assert p2.json().get("deactivation_exempt") is False
        finally:
            super_sess.delete(f"{API}/users/{uid}")


# ---------------- PERMISSION CATALOG ----------------
class TestPermissionCatalog:
    CUSTOM_KEY = f"custom.qa_tag_{uuid.uuid4().hex[:6]}"

    def test_custom_crud(self, super_sess):
        # POST
        r = super_sess.post(f"{API}/permission-catalog",
                            json={"key": self.CUSTOM_KEY, "description": "QA sample"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["custom"] is True and d["key"] == self.CUSTOM_KEY
        # GET listing includes it
        listing = super_sess.get(f"{API}/permission-catalog").json()
        assert any(e["key"] == self.CUSTOM_KEY for e in listing)
        # DELETE
        d2 = super_sess.delete(f"{API}/permission-catalog/{self.CUSTOM_KEY}")
        assert d2.status_code == 200
        # DELETE non-existent -> 404
        d3 = super_sess.delete(f"{API}/permission-catalog/does-not-exist-xyz")
        assert d3.status_code == 404

    def test_hide_builtin(self, super_sess):
        # Hide
        r = super_sess.patch(f"{API}/permission-catalog/users.view_all", json={"hidden": True})
        assert r.status_code == 200
        assert r.json()["hidden"] is True
        listing = super_sess.get(f"{API}/permission-catalog").json()
        row = next((e for e in listing if e["key"] == "users.view_all"), None)
        assert row and row["hidden"] is True
        # Flip back
        r2 = super_sess.patch(f"{API}/permission-catalog/users.view_all", json={"hidden": False})
        assert r2.status_code == 200
        assert r2.json()["hidden"] is False
