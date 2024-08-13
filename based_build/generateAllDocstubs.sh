for pythonVersion in 3.12 3.11 3.10 3.9 3.8; do
    ./pw pdm use $pythonVersion --first
    ./pw pdm install --group=docstubs --no-self --no-default
    ./pw pdm run generate_docstubs
done