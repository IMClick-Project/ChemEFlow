from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_unique_solution() -> None:
    response = client.post(
        "/linear-system/analyze",
        json={"matrix": [[1, 1], [0.4, 0.7]], "constants": [100, 58]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["classification"] == "unique"
    assert data["rankA"] == 2
    assert data["rankAugmented"] == 2
    assert data["solution"] == [40.0, 60.0]


def test_underdetermined_system() -> None:
    response = client.post(
        "/linear-system/analyze",
        json={"matrix": [[1, 1], [2, 2]], "constants": [10, 20]},
    )
    assert response.status_code == 200
    assert response.json()["classification"] == "underdetermined"


def test_inconsistent_system() -> None:
    response = client.post(
        "/linear-system/analyze",
        json={"matrix": [[1, 1], [2, 2]], "constants": [10, 21]},
    )
    assert response.status_code == 200
    assert response.json()["classification"] == "inconsistent"
