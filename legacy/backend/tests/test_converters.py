import json

from backend.app.converters import backend_to_frontend, frontend_to_backend

EXAMPLE_TREE = {
    "name": "Root",
    "conditional_tables": {
        "": {"A": 0.5, "B": 0.5},
        "X:Y": {"A": 0.7, "B": 0.3},
    },
    "outcomes": [
        {
            "name": "A",
            "child": {
                "name": "LeafA",
                "conditional_tables": {},
                "outcomes": [],
            },
        },
        {
            "name": "B",
            "child": None,
        },
    ],
}


def test_roundtrip():
    """frontend_to_backend -> backend_to_frontend should reproduce the original structure."""
    backend_tree = frontend_to_backend(EXAMPLE_TREE)
    result = backend_to_frontend(backend_tree)

    original = json.dumps(EXAMPLE_TREE, sort_keys=True)
    returned = json.dumps(result, sort_keys=True)

    assert returned == original
