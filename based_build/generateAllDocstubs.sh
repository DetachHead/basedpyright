for pythonVersion in 3.13 3.12 3.11 3.10 3.9 3.8; do
    ./pw uv venv --python $pythonVersion
    ./pw uv sync --only-group=docstubs --no-install-project
    ./pw uv run --no-sync based_build/generate_docstubs.py
done