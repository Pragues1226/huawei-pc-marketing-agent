@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Huawei PC Content Studio
set "WORKBENCH_ROOT=%~dp0"
set "WORKBENCH_STEP=locate project files"
cd /d "%WORKBENCH_ROOT%"
if errorlevel 1 goto failed
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
set "PIP_NO_CACHE_DIR=1"
if not exist "%WORKBENCH_ROOT%requirements.txt" goto missing_files
if not exist "%WORKBENCH_ROOT%app\__main__.py" goto missing_files

set "WORKBENCH_PYTHON=%WORKBENCH_ROOT%.venv\Scripts\python.exe"
if not exist "%WORKBENCH_PYTHON%" goto find_python
"%WORKBENCH_PYTHON%" -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto install_dependencies

:find_python
set "WORKBENCH_BASE="
set "WORKBENCH_ARGS="
for /d %%D in ("%WORKBENCH_ROOT%.runtime\python\cpython-*-windows-x86_64-none") do if exist "%%~fD\python.exe" (
    set "WORKBENCH_BASE=%%~fD\python.exe"
    goto create_environment
)
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    set "WORKBENCH_BASE=python"
    goto create_environment
)
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    set "WORKBENCH_BASE=py"
    set "WORKBENCH_ARGS=-3"
    goto create_environment
)
echo No usable Python was found. Keep the bundled .runtime folder with this project.
set "WORKBENCH_STEP=find local Python"
goto failed

:create_environment
set "WORKBENCH_STEP=create project environment"
echo Preparing the project environment...
"%WORKBENCH_BASE%" %WORKBENCH_ARGS% -m venv "%WORKBENCH_ROOT%.venv"
if errorlevel 1 goto failed

:install_dependencies
set "WORKBENCH_STEP=prepare pip"
"%WORKBENCH_PYTHON%" -m pip --version >nul 2>&1
if not errorlevel 1 goto install_packages
"%WORKBENCH_PYTHON%" -m ensurepip --upgrade
if errorlevel 1 goto failed

:install_packages
set "WORKBENCH_STEP=install project dependencies"
if exist "%WORKBENCH_ROOT%.runtime\wheels\*.whl" goto offline_install
"%WORKBENCH_PYTHON%" -m pip install --quiet -r "%WORKBENCH_ROOT%requirements.txt"
if errorlevel 1 goto failed
goto launch

:offline_install
"%WORKBENCH_PYTHON%" -m pip install --quiet --no-index --find-links "%WORKBENCH_ROOT%.runtime\wheels" -r "%WORKBENCH_ROOT%requirements.txt"
if errorlevel 1 goto failed

:launch
set "WORKBENCH_STEP=start local workbench"
echo Project: %WORKBENCH_ROOT%
echo Python: %WORKBENCH_PYTHON%
"%WORKBENCH_PYTHON%" -m app --open --auto-port %*
if errorlevel 1 goto failed
exit /b 0

:missing_files
echo Project files are missing. Keep this launcher, app and requirements.txt together.

:failed
echo.
echo Setup or launch failed at stage: %WORKBENCH_STEP%
echo Review the message above. This window will remain open.
pause
exit /b 1
