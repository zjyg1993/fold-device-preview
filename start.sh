#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"
RUN_DIR="${PROJECT_DIR}/.run"
PID_FILE="${RUN_DIR}/server.pid"
LOG_FILE="${RUN_DIR}/server.log"
PORT="${PORT:-9218}"
export PORT
command -v node >/dev/null 2>&1 || { echo "未找到 Node.js，请先安装 Node.js 18 或更新版本。" >&2; exit 1; }
mkdir -p "${RUN_DIR}"
# Serialize concurrent starts; never launch a second server for this project.
if ! mkdir "${RUN_DIR}/start.lock" 2>/dev/null; then
  echo "另一个启动操作正在进行；如上次启动被强制中断，请检查后移除 .run/start.lock。" >&2
  exit 1
fi
trap 'rmdir "${RUN_DIR}/start.lock" 2>/dev/null || true' EXIT
if [[ -f "${PID_FILE}" ]]; then
  pid="$(cat "${PID_FILE}")"
  if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "项目已运行（PID ${pid}），无需重复启动。"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi
nohup node "${PROJECT_DIR}/server.mjs" >> "${LOG_FILE}" 2>&1 < /dev/null &
pid=$!
echo "${pid}" > "${PID_FILE}"
# Wait for Node to report a bound port, rather than reporting a launched process as ready.
for ((attempt=0; attempt<50; attempt++)); do
  if ! kill -0 "${pid}" 2>/dev/null; then
    rm -f "${PID_FILE}"
    echo "启动失败，请检查日志：${LOG_FILE}" >&2
    tail -n 15 "${LOG_FILE}" >&2
    exit 1
  fi
  if command -v lsof >/dev/null 2>&1 && lsof -a -p "${pid}" -iTCP:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "已启动：http://localhost:${PORT}（PID ${pid}）"
    echo "日志：${LOG_FILE}"
    exit 0
  fi
  # A short startup grace period also works on systems without lsof.
  if ! command -v lsof >/dev/null 2>&1 && (( attempt >= 10 )); then
    echo "进程已启动（PID ${pid}）：http://localhost:${PORT}"
    echo "日志：${LOG_FILE}"
    exit 0
  fi
  sleep 0.1
done
echo "进程仍在启动（PID ${pid}），请检查日志：${LOG_FILE}" >&2
exit 1
