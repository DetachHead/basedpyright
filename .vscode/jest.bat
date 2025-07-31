::see jest.jestCommandLine in settings.json
@echo off
set PATH=%cd%/.venv/Scripts;%PATH%
npm run jest -- %*
