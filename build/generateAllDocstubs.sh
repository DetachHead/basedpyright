set -e
for pythonVersion in 3.14 3.13 3.12 3.11 3.10 3.9; do
    ./gg.cmd uv sync --only-group=docstubs --no-install-project --python $pythonVersion
    ./gg.cmd uv run --no-sync build/py3_8/generate_docstubs.py
done