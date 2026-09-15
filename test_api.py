import requests

try:
    url = "http://localhost:3000/api/admin/products/import"
    # Actually, running via API from python might fail because of authentication (cookies).
    print("Cannot easily test API directly without session cookie.")
except Exception as e:
    print(e)
