# ChemEFlow local Python engine

## Windows setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

Useful checks:

- Health: `http://127.0.0.1:8000/health`
- Interactive API docs: `http://127.0.0.1:8000/docs`

Keep this terminal open while using ChemEFlow.
