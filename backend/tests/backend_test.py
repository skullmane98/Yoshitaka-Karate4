"""
Backend integration tests for Yoshitaka Karate-Do CMS
Covers: auth, users, access codes, payments, QR, CMS, stats
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://karate-access-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "superadmin@yoshitaka.com"
SUPER_PASS = "SuperAdmin2026!"
STUDENT_CODE_SEED = "GHZ6-WHLZ"
ADMIN_CODE_SEED = "LCWD-95WP"


def _sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _unique_email(prefix="TEST"):
    return f"{prefix}_{uuid.uuid4().hex[:10]}@test.com"


# -------- fixtures --------
@pytest.fixture(scope="module")
def super_sess():
    s = _sess()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, f"Super admin login failed: {r.text}"
    assert s.cookies.get("access_token"), "access_token cookie not set"
    return s


@pytest.fixture(scope="module")
def fresh_student_code(super_sess):
    # ensure a fresh student code is available
    r = super_sess.post(f"{API}/access-codes", json={"role": "student", "max_uses": 5, "note": "TEST"})
    assert r.status_code == 200, r.text
    return r.json()["code"]


@pytest.fixture(scope="module")
def fresh_admin_code(super_sess):
    r = super_sess.post(f"{API}/access-codes", json={"role": "admin", "max_uses": 3, "note": "TEST-admin"})
    assert r.status_code == 200, r.text
    return r.json()["code"]


@pytest.fixture(scope="module")
def student_user(fresh_student_code):
    s = _sess()
    email = _unique_email("TEST_stu")
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Password1!", "name": "TEST Student",
        "access_code": fresh_student_code,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"sess": s, "id": data["id"], "email": email, "member_number": data["member_number"]}


@pytest.fixture(scope="module")
def admin_user(fresh_admin_code):
    s = _sess()
    email = _unique_email("TEST_adm")
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Password1!", "name": "TEST Admin",
        "access_code": fresh_admin_code,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"sess": s, "id": data["id"], "email": email}


# -------- AUTH --------
class TestAuth:
    def test_login_super_admin(self):
        s = _sess()
        r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == SUPER_EMAIL
        assert d["role"] == "super_admin"
        assert s.cookies.get("access_token")

    def test_login_invalid(self):
        r = _sess().post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_cookie(self, super_sess):
        r = super_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"

    def test_me_without_cookie(self):
        r = _sess().get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_invalid_code(self):
        r = _sess().post(f"{API}/auth/register", json={
            "email": _unique_email(), "password": "Password1!",
            "name": "X", "access_code": "ZZZZ-ZZZZ",
        })
        assert r.status_code == 400

    def test_register_student_and_increment(self, super_sess):
        # fresh code with uses=2
        cr = super_sess.post(f"{API}/access-codes", json={"role": "student", "max_uses": 2, "note": "TEST_inc"})
        code = cr.json()["code"]
        code_id = cr.json()["id"]

        for _ in range(2):
            r = _sess().post(f"{API}/auth/register", json={
                "email": _unique_email(), "password": "Password1!",
                "name": "TEST S", "access_code": code,
            })
            assert r.status_code == 200

        # Third should fail (exhausted)
        r3 = _sess().post(f"{API}/auth/register", json={
            "email": _unique_email(), "password": "Password1!",
            "name": "TEST S", "access_code": code,
        })
        assert r3.status_code == 400

        # verify used_count incremented
        codes = super_sess.get(f"{API}/access-codes").json()
        match = [c for c in codes if c["id"] == code_id][0]
        assert match["used_count"] == 2

    def test_register_admin_with_admin_code(self, fresh_admin_code):
        r = _sess().post(f"{API}/auth/register", json={
            "email": _unique_email("TEST_adm2"), "password": "Password1!",
            "name": "TEST Admin2", "access_code": fresh_admin_code,
        })
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# -------- USERS --------
class TestUsers:
    def test_list_users_as_super(self, super_sess, student_user, admin_user):
        r = super_sess.get(f"{API}/users")
        assert r.status_code == 200
        roles = {u["role"] for u in r.json()}
        assert "student" in roles and "admin" in roles and "super_admin" in roles

    def test_list_users_as_admin_only_students(self, admin_user, student_user):
        r = admin_user["sess"].get(f"{API}/users")
        assert r.status_code == 200
        for u in r.json():
            assert u["role"] == "student"

    def test_list_users_as_student_forbidden(self, student_user):
        r = student_user["sess"].get(f"{API}/users")
        assert r.status_code == 403

    def test_super_update_student(self, super_sess, student_user):
        new_email = _unique_email("TEST_upd").lower()
        r = super_sess.patch(f"{API}/users/{student_user['id']}", json={"belt_rank": "Yellow Belt", "email": new_email})
        assert r.status_code == 200
        assert r.json()["belt_rank"] == "Yellow Belt"
        assert r.json()["email"] == new_email
        # keep track for later tests
        student_user["email"] = new_email
        # persistence check
        g = super_sess.get(f"{API}/users/{student_user['id']}")
        assert g.json()["belt_rank"] == "Yellow Belt"

    def test_admin_cannot_edit_other_admin(self, admin_user, super_sess, fresh_admin_code):
        # create another admin
        other_email = _unique_email("TEST_adm3")
        reg = _sess().post(f"{API}/auth/register", json={
            "email": other_email, "password": "Password1!",
            "name": "Other Admin", "access_code": fresh_admin_code,
        })
        assert reg.status_code == 200
        other_id = reg.json()["id"]
        r = admin_user["sess"].patch(f"{API}/users/{other_id}", json={"name": "Hack"})
        assert r.status_code == 403

    def test_student_self_update(self, student_user):
        r = student_user["sess"].patch(f"{API}/users/{student_user['id']}", json={"name": "Self Name", "belt_rank": "Black"})
        assert r.status_code == 200
        assert r.json()["name"] == "Self Name"
        # belt_rank should NOT have been changed by student self-update
        assert r.json()["belt_rank"] != "Black"

    def test_super_reset_password(self, super_sess, student_user):
        r = super_sess.post(f"{API}/users/{student_user['id']}/password", json={"new_password": "NewPass1!"})
        assert r.status_code == 200
        # login with new
        login = _sess().post(f"{API}/auth/login", json={"email": student_user["email"], "password": "NewPass1!"})
        assert login.status_code == 200
        # restore session for other tests
        s2 = _sess()
        s2.post(f"{API}/auth/login", json={"email": student_user["email"], "password": "NewPass1!"})
        student_user["sess"] = s2

    def test_student_cannot_delete(self, student_user):
        r = student_user["sess"].delete(f"{API}/users/{student_user['id']}")
        assert r.status_code == 403

    def test_super_delete_user(self, super_sess, fresh_student_code):
        # create disposable
        s = _sess()
        email = _unique_email("TEST_del")
        reg = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Password1!", "name": "Dispose", "access_code": fresh_student_code
        })
        uid = reg.json()["id"]
        d = super_sess.delete(f"{API}/users/{uid}")
        assert d.status_code == 200
        g = super_sess.get(f"{API}/users/{uid}")
        assert g.status_code == 404


# -------- ACCESS CODES --------
class TestAccessCodes:
    def test_admin_cannot_create_admin_code(self, admin_user):
        r = admin_user["sess"].post(f"{API}/access-codes", json={"role": "admin", "max_uses": 1})
        assert r.status_code == 403

    def test_admin_can_create_student_code(self, admin_user):
        r = admin_user["sess"].post(f"{API}/access-codes", json={"role": "student", "max_uses": 1})
        assert r.status_code == 200
        assert r.json()["role"] == "student"

    def test_super_can_create_admin_code(self, super_sess):
        r = super_sess.post(f"{API}/access-codes", json={"role": "admin", "max_uses": 1})
        assert r.status_code == 200

    def test_admin_list_only_student_codes(self, admin_user):
        r = admin_user["sess"].get(f"{API}/access-codes")
        assert r.status_code == 200
        for c in r.json():
            assert c["role"] == "student"

    def test_deactivate_code(self, super_sess):
        cr = super_sess.post(f"{API}/access-codes", json={"role": "student", "max_uses": 1, "note": "TEST_del"})
        cid = cr.json()["id"]
        d = super_sess.delete(f"{API}/access-codes/{cid}")
        assert d.status_code == 200
        codes = super_sess.get(f"{API}/access-codes").json()
        match = [c for c in codes if c["id"] == cid][0]
        assert match["active"] is False


# -------- PAYMENTS --------
class TestPayments:
    def test_admin_invoice_student(self, admin_user, student_user):
        r = admin_user["sess"].post(f"{API}/payments", json={
            "user_id": student_user["id"], "amount": 100.0, "description": "TEST Monthly"
        })
        assert r.status_code == 200
        pid = r.json()["id"]
        # mark paid
        up = admin_user["sess"].patch(f"{API}/payments/{pid}", json={"status": "paid"})
        assert up.status_code == 200
        assert up.json()["status"] == "paid"
        assert up.json()["paid_date"] is not None

    def test_admin_cannot_invoice_admin(self, admin_user, super_sess):
        # find another admin
        users = super_sess.get(f"{API}/users").json()
        other_admins = [u for u in users if u["role"] == "admin" and u["id"] != admin_user["id"]]
        if not other_admins:
            pytest.skip("No other admin")
        r = admin_user["sess"].post(f"{API}/payments", json={
            "user_id": other_admins[0]["id"], "amount": 50, "description": "bad"
        })
        assert r.status_code == 403

    def test_student_sees_only_own_payments(self, student_user):
        r = student_user["sess"].get(f"{API}/payments")
        assert r.status_code == 200
        for p in r.json():
            assert p["user_id"] == student_user["id"]


# -------- QR / BARCODE --------
class TestQR:
    def test_student_own_qr(self, student_user):
        r = student_user["sess"].get(f"{API}/users/{student_user['id']}/qrcode")
        assert r.status_code == 200
        d = r.json()
        assert d["qr_png"].startswith("data:image/png;base64,")
        assert d["barcode_png"].startswith("data:image/png;base64,")
        assert d["member_number"] == student_user["member_number"]

    def test_student_cannot_get_other_qr(self, student_user, admin_user):
        r = student_user["sess"].get(f"{API}/users/{admin_user['id']}/qrcode")
        assert r.status_code == 403


# -------- CMS --------
class TestCMS:
    def test_list_pages_public(self):
        r = requests.get(f"{API}/cms/pages")
        assert r.status_code == 200
        slugs = {p["slug"] for p in r.json()}
        assert "home" in slugs

    def test_get_home_page_public(self):
        r = requests.get(f"{API}/cms/pages/home")
        assert r.status_code == 200
        assert "hero_headline" in r.json()["content"]

    def test_put_page_requires_super_admin(self, admin_user):
        r = admin_user["sess"].put(f"{API}/cms/pages/home", json={"title": "X", "content": {}})
        assert r.status_code == 403

    def test_super_update_page(self, super_sess):
        current = requests.get(f"{API}/cms/pages/home").json()
        new_content = dict(current["content"])
        new_content["tagline"] = "TEST Tagline"
        r = super_sess.put(f"{API}/cms/pages/home", json={"title": current["title"], "content": new_content})
        assert r.status_code == 200
        # verify reflected
        pub = requests.get(f"{API}/cms/pages/home").json()
        assert pub["content"]["tagline"] == "TEST Tagline"
        # restore
        super_sess.put(f"{API}/cms/pages/home", json={"title": current["title"], "content": current["content"]})


# -------- STATS --------
class TestStats:
    def test_stats_as_super(self, super_sess):
        r = super_sess.get(f"{API}/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("users", "students", "admins", "payments_due_total", "payments_due_count"):
            assert k in d

    def test_stats_as_admin(self, admin_user):
        r = admin_user["sess"].get(f"{API}/stats")
        assert r.status_code == 200

    def test_stats_student_forbidden(self, student_user):
        r = student_user["sess"].get(f"{API}/stats")
        assert r.status_code == 403


# -------- FORGOT / RESET PASSWORD --------
class TestPasswordReset:
    """Tests for /api/auth/forgot-password and /api/auth/reset-password."""

    LOG_PATH = "/var/log/supervisor/backend.err.log"

    def _grab_token_for_email(self, email: str) -> str:
        """Tail the backend log and parse out the most recent token for given email."""
        import subprocess
        try:
            out = subprocess.run(
                ["tail", "-n", "500", self.LOG_PATH],
                capture_output=True, text=True, timeout=5,
            ).stdout
        except Exception:
            return ""
        tokens = []
        for line in out.splitlines():
            if f"PASSWORD RESET LINK for {email}" in line and "token=" in line:
                tokens.append(line.split("token=")[-1].strip())
        return tokens[-1] if tokens else ""

    def test_forgot_password_existing_email_ok(self):
        r = _sess().post(f"{API}/auth/forgot-password", json={"email": SUPER_EMAIL})
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # give log a moment to flush
        import time; time.sleep(0.3)
        token = self._grab_token_for_email(SUPER_EMAIL)
        assert token, "Expected a reset token line in backend log for existing user"

    def test_forgot_password_nonexistent_email_no_enumeration(self):
        r = _sess().post(f"{API}/auth/forgot-password",
                         json={"email": "does-not-exist-xyz@nowhere.com"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_password_missing_email_returns_400(self):
        r = _sess().post(f"{API}/auth/forgot-password", json={})
        assert r.status_code == 400

    def test_reset_password_bad_token(self):
        r = _sess().post(f"{API}/auth/reset-password",
                         json={"token": "not-a-real-token", "new_password": "NewPass1!"})
        assert r.status_code == 400

    def test_reset_password_short_password(self):
        r = _sess().post(f"{API}/auth/reset-password",
                         json={"token": "whatever", "new_password": "123"})
        assert r.status_code == 400

    def test_reset_password_end_to_end_and_token_reuse_blocked(self):
        """Full flow: forgot -> grab token -> reset -> login with new pwd.
        Then verify token cannot be reused. Finally restore original password."""
        import time
        # 1. issue token
        r = _sess().post(f"{API}/auth/forgot-password", json={"email": SUPER_EMAIL})
        assert r.status_code == 200
        time.sleep(0.4)
        token = self._grab_token_for_email(SUPER_EMAIL)
        assert token, "No reset token captured from log"

        new_pass = "ResetTmp2026!"
        # 2. reset to new password
        r2 = _sess().post(f"{API}/auth/reset-password",
                          json={"token": token, "new_password": new_pass})
        assert r2.status_code == 200, r2.text

        # 3. login with new password works
        s = _sess()
        login = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": new_pass})
        assert login.status_code == 200, f"Login with reset password failed: {login.text}"

        # 4. token reuse is blocked
        r3 = _sess().post(f"{API}/auth/reset-password",
                          json={"token": token, "new_password": "AnotherPass1!"})
        assert r3.status_code == 400

        # 5. old password must no longer work
        bad = _sess().post(f"{API}/auth/login",
                           json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert bad.status_code == 401

        # 6. restore original password via a second forgot/reset cycle
        _sess().post(f"{API}/auth/forgot-password", json={"email": SUPER_EMAIL})
        time.sleep(0.4)
        token2 = self._grab_token_for_email(SUPER_EMAIL)
        assert token2 and token2 != token
        restore = _sess().post(f"{API}/auth/reset-password",
                               json={"token": token2, "new_password": SUPER_PASS})
        assert restore.status_code == 200
        # sanity: original creds work again
        final = _sess().post(f"{API}/auth/login",
                             json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert final.status_code == 200


# -------- LOGOUT --------
class TestLogout:
    def test_logout_clears_cookie(self):
        s = _sess()
        s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert s.cookies.get("access_token")
        s.post(f"{API}/auth/logout")
        # After logout, /me should return 401
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401
