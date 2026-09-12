#!/bin/bash
# Inerre Studio — Launcher
# Usage: ./start.sh [web|javafx|csharp]

export JAVA_HOME=$HOME/.local/jdk17/Contents/Home
export PATH=$PATH:$HOME/.local/jdk17/bin:$HOME/.local/maven/bin
DIR="$(cd "$(dirname "$0")" && pwd)"

case "${1:-web}" in
  web)
    echo "=== Web Version ==="
    echo "http://localhost:4173"
    screen -S inerre -dm bash -c "cd '$DIR' && python3 ai_server.py 4173"
    sleep 2
    open http://localhost:4173
    ;;
  javafx)
    echo "=== JavaFX Desktop ==="
    cd "$DIR/versions/desktop-javafx" && mvn javafx:run
    ;;
  csharp)
    echo "=== C# Desktop ==="
    echo "Requires .NET SDK: dotnet run"
    cd "$DIR/versions/desktop-csharp" && dotnet run 2>/dev/null || echo "Install .NET: brew install dotnet"
    ;;
  stop)
    echo "=== Stop Web Server ==="
    screen -S inerre -X quit 2>/dev/null
    kill $(lsof -ti:4173) 2>/dev/null
    echo "Stopped"
    ;;
  *)
    echo "Usage: ./start.sh [web|javafx|csharp|stop]"
    ;;
esac
