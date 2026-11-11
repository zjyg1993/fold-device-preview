#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${PROJECT_DIR}/.run/server.pid"
if [[ ! -f "${PID_FILE}" ]]; then
  echo "项目未通过 start.sh 启动，无需停止。"
  exit 0
fi
pid="$(cat "${PID_FILE}")"
if [[ ! "${pid}" =~ ^[0-9]+$ ]] || [[ "${pid}" -le 1 ]]; then
  echo "PID 文件无效，请检查：${PID_FILE}" >&2
  exit 1
fi
if ! kill -0 "${pid}" 2>/dev/null; then
  rm -f "${PID_FILE}"
  echo "项目已停止，已清理过期 PID。"
  exit 0
fi
# Check ownership when lsof is available; do not kill a PID reused by another project.
if command -v lsof >/dev/null 2>&1; then
  process_cwd="$(lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
  if [[ "${process_cwd}" != "${PROJECT_DIR}" ]]; then
    echo "PID ${pid} 不属于当前项目，已拒绝停止；请检查 ${PID_FILE}。" >&2
    exit 1
  fi
fi
kill -TERM "${pid}"
for ((attempt=0; attempt<50; attempt++)); do
  if ! kill -0 "${pid}" 2>/dev/null; then
    rm -f "${PID_FILE}"
    echo "项目已停止（PID ${pid}）。"
    exit 0
  fi
  sleep 0.1
done
echo "进程尚未退出，保留 PID 文件；请检查日志后手动处理。" >&2
exit 1
