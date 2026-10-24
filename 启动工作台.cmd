@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0start-workbench.cmd" %*
exit /b %errorlevel%
