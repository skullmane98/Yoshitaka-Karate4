#!/usr/bin/env python3
"""
Backend test for super-admin role-change capability.
Tests PATCH /api/users/{user_id} with role field.
"""
import requests
import sys
from typing import Optional

# Read backend URL from frontend/.env
BACKEND_URL = "https://open-project-47.preview.emergentagent.com/api"

# Super admin credentials from test_credentials.md
SUPER_ADMIN_EMAIL = "superadmin@yoshitaka.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin2026!"

# Test results tracking
test_results = []


def log_test(scenario: str, passed: bool, details: str):
    """Log test result."""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status} - Scenario {scenario}")
    print(f"  Details: {details}")
    test_results.append({"scenario": scenario, "passed": passed, "details": details})


def login(email: str, password: str) -> Optional[str]:
    """Login and return Bearer token."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token")
        else:
            print(f"Login failed for {email}: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Login exception for {email}: {e}")
        return None


def register_user(email: str, password: str, name: str, access_code: str) -> Optional[dict]:
    """Register a new user and return user data."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/auth/register",
            json={
                "email": email,
                "password": password,
                "name": name,
                "access_code": access_code
            },
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"Registration failed for {email}: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Registration exception for {email}: {e}")
        return None


def create_access_code(token: str, role: str, max_uses: int = 1) -> Optional[str]:
    """Create an access code and return the code string."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/access-codes",
            json={"role": role, "max_uses": max_uses, "note": f"Test {role} code"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("code")
        else:
            print(f"Access code creation failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        print(f"Access code creation exception: {e}")
        return None


def patch_user(token: str, user_id: str, payload: dict) -> Optional[dict]:
    """PATCH /api/users/{user_id} and return response."""
    try:
        resp = requests.patch(
            f"{BACKEND_URL}/users/{user_id}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        return {"status": resp.status_code, "data": resp.json() if resp.status_code in [200, 400, 403] else None, "text": resp.text}
    except Exception as e:
        print(f"PATCH user exception: {e}")
        return None


def delete_user(token: str, user_id: str) -> bool:
    """Delete a user (cleanup)."""
    try:
        resp = requests.delete(
            f"{BACKEND_URL}/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        return resp.status_code == 200
    except Exception as e:
        print(f"Delete user exception: {e}")
        return False


def get_me(token: str) -> Optional[dict]:
    """Get current user info."""
    try:
        resp = requests.get(
            f"{BACKEND_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        print(f"Get me exception: {e}")
        return None


def get_users(token: str) -> Optional[list]:
    """Get all users."""
    try:
        resp = requests.get(
            f"{BACKEND_URL}/users",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception as e:
        print(f"Get users exception: {e}")
        return None


def main():
    print("=" * 80)
    print("BACKEND TEST: Super Admin Role-Change Capability")
    print("=" * 80)

    # Track created users for cleanup
    created_users = []

    # Scenario 1: Login as super admin
    print("\n[Scenario 1] Login as super admin")
    sa_token = login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    if sa_token:
        log_test("1", True, "Super admin login successful, Bearer token obtained")
    else:
        log_test("1", False, "Super admin login failed")
        print("\n❌ Cannot proceed without super admin token. Exiting.")
        sys.exit(1)

    # Get super admin user info
    sa_user = get_me(sa_token)
    if not sa_user:
        log_test("1", False, "Failed to get super admin user info")
        sys.exit(1)
    sa_user_id = sa_user["id"]

    # Scenario 2: Create student access code and register a test student
    print("\n[Scenario 2] Create student access code and register test student")
    student_code = create_access_code(sa_token, "student", max_uses=1)
    if not student_code:
        log_test("2", False, "Failed to create student access code")
        sys.exit(1)

    test_student = register_user(
        email=f"teststudent_{student_code[:4].lower()}@test.com",
        password="TestPass123!",
        name="Test Student",
        access_code=student_code
    )
    if test_student and test_student.get("role") == "student":
        created_users.append(test_student["id"])
        log_test("2", True, f"Test student registered successfully (id={test_student['id']}, role=student, belt_rank={test_student.get('belt_rank')})")
    else:
        log_test("2", False, "Failed to register test student")
        sys.exit(1)

    # Scenario 3: Create admin access code and register a test admin
    print("\n[Scenario 3] Create admin access code and register test admin")
    admin_code = create_access_code(sa_token, "admin", max_uses=1)
    if not admin_code:
        log_test("3", False, "Failed to create admin access code")
        sys.exit(1)

    test_admin = register_user(
        email=f"testadmin_{admin_code[:4].lower()}@test.com",
        password="TestPass123!",
        name="Test Admin",
        access_code=admin_code
    )
    if test_admin and test_admin.get("role") == "admin":
        created_users.append(test_admin["id"])
        log_test("3", True, f"Test admin registered successfully (id={test_admin['id']}, role=admin, belt_rank={test_admin.get('belt_rank')})")
    else:
        log_test("3", False, "Failed to register test admin")
        sys.exit(1)

    # Scenario 4: Super admin promotes student → admin (belt_rank should be cleared)
    print("\n[Scenario 4] Super admin promotes student → admin")
    result = patch_user(sa_token, test_student["id"], {"role": "admin"})
    if result and result["status"] == 200:
        updated_user = result["data"]
        if updated_user["role"] == "admin" and updated_user.get("belt_rank") is None:
            log_test("4", True, f"Student promoted to admin successfully, belt_rank cleared (role={updated_user['role']}, belt_rank={updated_user.get('belt_rank')})")
        else:
            log_test("4", False, f"Role change succeeded but belt_rank not cleared properly (role={updated_user['role']}, belt_rank={updated_user.get('belt_rank')})")
    else:
        log_test("4", False, f"Failed to promote student to admin: {result}")

    # Scenario 5: Super admin demotes admin → student (belt_rank should default to "White Belt")
    print("\n[Scenario 5] Super admin demotes admin → student")
    result = patch_user(sa_token, test_student["id"], {"role": "student"})
    if result and result["status"] == 200:
        updated_user = result["data"]
        if updated_user["role"] == "student" and updated_user.get("belt_rank") == "White Belt":
            log_test("5", True, f"Admin demoted to student successfully, belt_rank set to 'White Belt' (role={updated_user['role']}, belt_rank={updated_user.get('belt_rank')})")
        else:
            log_test("5", False, f"Role change succeeded but belt_rank not set to 'White Belt' (role={updated_user['role']}, belt_rank={updated_user.get('belt_rank')})")
    else:
        log_test("5", False, f"Failed to demote admin to student: {result}")

    # Scenario 6: Admin tries to change role (should be silently ignored or 403)
    print("\n[Scenario 6] Admin tries to change another user's role")
    # First, login as the test admin
    admin_token = login(test_admin["email"], "TestPass123!")
    if not admin_token:
        log_test("6", False, "Failed to login as test admin")
    else:
        # Admin tries to promote the student to super_admin
        result = patch_user(admin_token, test_student["id"], {"role": "super_admin"})
        if result:
            if result["status"] == 200:
                # Role change should be silently ignored
                updated_user = result["data"]
                if updated_user["role"] == "student":
                    log_test("6", True, f"Admin's role change attempt silently ignored (role unchanged: {updated_user['role']})")
                else:
                    log_test("6", False, f"Admin was able to change role (unexpected): {updated_user['role']}")
            elif result["status"] == 403:
                log_test("6", True, "Admin received 403 when trying to change role (acceptable)")
            else:
                log_test("6", False, f"Unexpected status code: {result['status']}")
        else:
            log_test("6", False, "Failed to execute PATCH request")

    # Scenario 7: Super admin tries to change own role (should be silently ignored)
    print("\n[Scenario 7] Super admin tries to change own role")
    result = patch_user(sa_token, sa_user_id, {"role": "admin"})
    if result and result["status"] == 200:
        updated_user = result["data"]
        if updated_user["role"] == "super_admin":
            log_test("7", True, f"Super admin's self role-change silently ignored (role unchanged: {updated_user['role']})")
        else:
            log_test("7", False, f"Super admin was able to change own role (unexpected): {updated_user['role']}")
    else:
        log_test("7", False, f"Failed to PATCH super admin's own role: {result}")

    # Scenario 8: Demoting one of two super_admins should succeed (leaving 1)
    print("\n[Scenario 8] Demoting one of two super_admins should succeed (leaving 1)")
    # First, create a second super admin by promoting test_admin
    result = patch_user(sa_token, test_admin["id"], {"role": "super_admin"})
    if result and result["status"] == 200:
        print(f"  Created second super admin: {test_admin['id']}")
        
        # Debug: List all users to verify we have 2 super_admins
        all_users = get_users(sa_token)
        if all_users:
            super_admins = [u for u in all_users if u.get("role") == "super_admin" and u.get("active")]
            print(f"  DEBUG: Active super_admins count: {len(super_admins)}")
            for sa in super_admins:
                print(f"    - {sa['email']} (id={sa['id'][:8]}...)")
        
        # Now try to demote the second super_admin using the first super_admin's token
        # This should SUCCEED (200) because demoting them would leave 1 super_admin (the requester)
        # The safety check only fires when other_sa < 1 (i.e., would leave 0 super_admins)
        result2 = patch_user(sa_token, test_admin["id"], {"role": "admin"})
        if result2 and result2["status"] == 200:
            updated_user = result2["data"]
            if updated_user["role"] == "admin":
                log_test("8", True, f"Successfully demoted one of two super_admins (leaving 1 super_admin as expected): role={updated_user['role']}")
            else:
                log_test("8", False, f"Demotion succeeded but role not changed: {updated_user['role']}")
        else:
            log_test("8", False, f"Expected 200 when demoting one of two super_admins, got: {result2}")
    else:
        log_test("8", False, f"Failed to promote test_admin to super_admin: {result}")

    # Scenario 9: Verify existing flows still work
    print("\n[Scenario 9] Verify existing flows still work")
    # Test name update by super admin
    result = patch_user(sa_token, test_student["id"], {"name": "Updated Student Name"})
    if result and result["status"] == 200 and result["data"]["name"] == "Updated Student Name":
        print("  ✓ Super admin can update student name")
        name_update_ok = True
    else:
        print("  ✗ Super admin name update failed")
        name_update_ok = False

    # Test belt_rank update by super admin
    result = patch_user(sa_token, test_student["id"], {"belt_rank": "Yellow Belt"})
    if result and result["status"] == 200 and result["data"]["belt_rank"] == "Yellow Belt":
        print("  ✓ Super admin can update student belt_rank")
        belt_update_ok = True
    else:
        print("  ✗ Super admin belt_rank update failed")
        belt_update_ok = False

    # Test admin can edit student's name
    result = patch_user(admin_token, test_student["id"], {"name": "Admin Updated Name"})
    if result and result["status"] == 200 and result["data"]["name"] == "Admin Updated Name":
        print("  ✓ Admin can update student name")
        admin_edit_ok = True
    else:
        print("  ✗ Admin student name update failed")
        admin_edit_ok = False

    # Test admin cannot edit another admin - create a second admin first
    admin2_code = create_access_code(sa_token, "admin", max_uses=1)
    if admin2_code:
        test_admin2 = register_user(
            email=f"testadmin2_{admin2_code[:4].lower()}@test.com",
            password="TestPass123!",
            name="Test Admin 2",
            access_code=admin2_code
        )
        if test_admin2:
            created_users.append(test_admin2["id"])
            # Now test if admin can edit another admin (should fail with 403)
            result = patch_user(admin_token, test_admin2["id"], {"name": "Should Fail"})
            if result and result["status"] == 403:
                print("  ✓ Admin correctly blocked from editing another admin (403)")
                admin_block_ok = True
            else:
                print(f"  ✗ Admin should be blocked from editing another admin, got: {result}")
                admin_block_ok = False
        else:
            print("  ✗ Failed to create second admin for testing")
            admin_block_ok = False
    else:
        print("  ✗ Failed to create access code for second admin")
        admin_block_ok = False

    if name_update_ok and belt_update_ok and admin_edit_ok and admin_block_ok:
        log_test("9", True, "All existing flows work correctly")
    else:
        log_test("9", False, "Some existing flows failed")

    # Scenario 10: Smoke test other endpoints
    print("\n[Scenario 10] Smoke test other endpoints")
    # Test /auth/me
    me_result = get_me(sa_token)
    if me_result and me_result.get("email") == SUPER_ADMIN_EMAIL:
        print("  ✓ /auth/me works")
        me_ok = True
    else:
        print("  ✗ /auth/me failed")
        me_ok = False

    # Test /access-codes list
    try:
        resp = requests.get(
            f"{BACKEND_URL}/access-codes",
            headers={"Authorization": f"Bearer {sa_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            print("  ✓ /access-codes list works")
            codes_ok = True
        else:
            print(f"  ✗ /access-codes list failed: {resp.status_code}")
            codes_ok = False
    except Exception as e:
        print(f"  ✗ /access-codes list exception: {e}")
        codes_ok = False

    # Test /payments list
    try:
        resp = requests.get(
            f"{BACKEND_URL}/payments",
            headers={"Authorization": f"Bearer {sa_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            print("  ✓ /payments list works")
            payments_ok = True
        else:
            print(f"  ✗ /payments list failed: {resp.status_code}")
            payments_ok = False
    except Exception as e:
        print(f"  ✗ /payments list exception: {e}")
        payments_ok = False

    if me_ok and codes_ok and payments_ok:
        log_test("10", True, "All smoke tests passed")
    else:
        log_test("10", False, "Some smoke tests failed")

    # Cleanup: Delete test users
    print("\n[Cleanup] Deleting test users...")
    for user_id in created_users:
        if delete_user(sa_token, user_id):
            print(f"  ✓ Deleted user {user_id}")
        else:
            print(f"  ✗ Failed to delete user {user_id}")

    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    print(f"\nTotal: {passed}/{total} scenarios passed")
    
    for result in test_results:
        status = "✅" if result["passed"] else "❌"
        print(f"{status} Scenario {result['scenario']}: {result['details'][:80]}")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
