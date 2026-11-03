@echo off
setlocal

cd /d "%~dp0"
if errorlevel 1 (
    echo No se pudo abrir la carpeta del proyecto.
    pause
    exit /b 1
)

git rev-parse --show-toplevel >nul 2>&1
if errorlevel 1 (
    echo Esta carpeta no es un repositorio Git.
    pause
    exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current') do set "RAMA=%%B"
if not defined RAMA (
    echo No se pudo determinar la rama actual.
    pause
    exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo No existe un remoto llamado origin.
    pause
    exit /b 1
)

echo.
echo Agregando los cambios del proyecto...
git add -A
if errorlevel 1 (
    echo No se pudieron agregar los cambios.
    pause
    exit /b 1
)

git diff --cached --quiet
if not errorlevel 1 (
    echo No hay cambios nuevos para guardar.
    pause
    exit /b 0
)

echo.
set "MENSAJE="
set /p "MENSAJE=Escribe el mensaje del commit (Enter para usar 'Actualizacion del proyecto'): "
if not defined MENSAJE set "MENSAJE=Actualizacion del proyecto"

git commit -m "%MENSAJE%"
if errorlevel 1 (
    echo No se pudo crear el commit. Revisa los cambios y vuelve a intentarlo.
    pause
    exit /b 1
)

echo.
echo Subiendo la rama %RAMA% a GitHub...
git push -u origin "%RAMA%"
if errorlevel 1 (
    echo No se pudo subir a GitHub.
    echo Si la rama remota tiene cambios nuevos, sincronizalos antes de volver a intentarlo.
    pause
    exit /b 1
)

echo.
echo Proyecto actualizado correctamente en GitHub.
pause
exit /b 0
