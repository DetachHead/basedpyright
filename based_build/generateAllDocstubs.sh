for pythonVersion in 3.13 3.12 3.11 3.10 3.9; do
    ./pw pdm use $pythonVersion --first
    ./pw pdm install --group=docstubs --no-self --no-default
    ./pw pdm run generate_docstubs
done
for pythonVersion in 3.8; do
    ./pw pdm use $pythonVersion --first
    ./pw pdm install --group=docstubs-old --no-self --no-default --lockfile pdm.docstubs-old.lock
    ./pw pdm run generate_docstubs
done