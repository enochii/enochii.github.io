@echo off

echo 0. Install  1. Start(8899)  2. Build  3. Deploy
set input=
set /p input=Select option:

if "%input%" == "0" call :installFunc
if "%input%" == "1" call :startFunc 8899
if "%input%" == "2" call :buildFunc
if "%input%" == "3" call :deployFunc

goto :eof

:installFunc
call bundle install
goto :eof

:startFunc
call bundle exec jekyll serve --watch --host=0.0.0.0 --port=%1%
goto :eof

:buildFunc
call bundle exec jekyll build --destination=dist
goto :eof

:deployFunc
REM Build
call :buildFunc
REM Switch to deploy directory
D:
cd D:\vscode-work-space\workspace-go\blog-deploy
go run main.go
REM Switch back
%~d0
cd %~dp0
goto :eof