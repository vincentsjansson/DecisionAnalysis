import json
from backend.converters import frontend_to_backend, backend_to_frontend

def test_roundtrip(tree_json):
    print("=== TESTAR KONVERTERARE ===")

    backend_tree = frontend_to_backend(tree_json)

    json_back = backend_to_frontend(backend_tree)

    # 3. Jämför strukturer
    original = json.dumps(tree_json, sort_keys=True)
    returned = json.dumps(json_back, sort_keys=True)

    if original == returned:
        print("✔ Roundtrip OK — modellerna är synkade")
    else:
        print("❌ Roundtrip mismatch — något skiljer sig")
        print("\n--- ORIGINAL ---")
        print(original)
        print("\n--- RETURNED ---")
        print(returned)

    return json_back


if __name__ == "__main__":
    example_tree = {
        "name": "Root",
        "conditional_tables": {
            "": {"A": 0.5, "B": 0.5},
            "X:Y": {"A": 0.7, "B": 0.3}
        },
        "outcomes": [
            {
                "name": "A",
                "child": {
                    "name": "LeafA",
                    "conditional_tables": {},
                    "outcomes": []
                }
            },
            {
                "name": "B",
                "child": None
            }
        ]
    }

    test_roundtrip(example_tree)
