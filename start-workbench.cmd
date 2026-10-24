@echo off
chcp 65001 >nul
setlocal
title Huawei PC Content Studio
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

if exist ".venv\Scripts\python.exe" goto use_venv
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto use_python
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto use_py
echo 未找到可用的 Python 3.10 或更高版本。
echo 请安装 Python，并启用 Add Python to PATH 后重新双击本文件。
goto failed

:use_venv
set "WORKBENCH_PYTHON=%CD%\.venv\Scripts\python.exe"
set "WORKBENCH_ARGS="
goto check_environment

:use_python
set "WORKBENCH_PYTHON=python"
set "WORKBENCH_ARGS="
goto check_environment

:use_py
set "WORKBENCH_PYTHON=py"
set "WORKBENCH_ARGS=-3"

:check_environment
"%WORKBENCH_PYTHON%" %WORKBENCH_ARGS% -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if errorlevel 1 goto invalid_environment
"%WORKBENCH_PYTHON%" %WORKBENCH_ARGS% -c "from jsonschema import Draft202012Validator; import rfc3339_validator" >nul 2>&1
if not errorlevel 1 goto launch

echo 正在准备首次运行所需的依赖，请保持网络连接。
if exist ".venv\Scripts\python.exe" goto install_dependencies
"%WORKBENCH_PYTHON%" %WORKBENCH_ARGS% -m venv ".venv"
if errorlevel 1 goto failed

:install_dependencies
set "WORKBENCH_PYTHON=%CD%\.venv\Scripts\python.exe"
set "WORKBENCH_ARGS="
"%WORKBENCH_PYTHON%" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto failed

:launch
echo 项目目录：%CD%
echo 正在启动这份项目的新界面，浏览器将自动打开。
"%WORKBENCH_PYTHON%" %WORKBENCH_ARGS% -m app --open --auto-port %*
if errorlevel 1 goto failed
exit /b 0

:invalid_environment
echo 本地 .venv 中的 Python 无法运行或低于 3.10。
echo 请先修复或移走该虚拟环境，再重新启动。

:failed
echo.
echo 启动未完成，请查看上方提示。此窗口不会自动关闭。
pause
exit /b 1
