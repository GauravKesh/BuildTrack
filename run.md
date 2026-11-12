# BuildTrack — Run Instructions

### macOS / Linux:
```bash
./start.sh
```
*(Or with sensor simulator: `./start.sh --with-sim`)*

### Windows:
Double-click `start.bat` in the project root, or run in Command Prompt / Terminal:
```cmd
start.bat
```
*(Or in PowerShell: `.\start.ps1` or `.\start.ps1 -WithSim`)*

---

### What this single command does automatically:
1. Verifies backing services (PostgreSQL, MongoDB, Redis, Mosquitto) and starts them if needed.
2. Checks/initializes `.venv` and Python dependencies.
3. Automatically runs database migrations (`python -m app.cli migrate`).
4. Launches the Next.js frontend and all 4 required backend server roles concurrently:
   - **Next.js Control Room UI** (`http://localhost:3000`)
   - **REST API & Socket.IO server** (`http://localhost:8000`)
   - **Stream Processing Worker** (Redis streams, rule engine, 1-minute KPI rollups)
   - **MQTT Consumer** (Mosquitto subscriber on port 1883)
   - **Video Stream Handler** (CCTV camera frames & CV PPE inference)
   - *(Optional with `--with-sim`)*: **Device & Camera Simulator** (`http://localhost:8090`)
5. Cleanly stops all background processes when you press `Ctrl+C`.

---

## 🔑 Useful URLs & Demo Credentials

| Resource | URL |
|---|---|
| **Control Room Dashboard** | `http://localhost:3000` |
| **Swagger API Docs** | `http://localhost:8000/docs` |
| **ReDoc** | `http://localhost:8000/redoc` |
| **OpenAPI Schema** | `http://localhost:8000/openapi.json` |
| **Liveness Health** | `http://localhost:8000/health/live` |
| **Readiness Health** | `http://localhost:8000/health/ready` |
| **Prometheus Metrics** | `http://localhost:8000/metrics` |
| **Real-time WebSocket** | `ws://localhost:8000/socket.io` (`/live` namespace) |

### Demo Accounts:
| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@buildtrack.com` | `Admin@123456` |
| **Safety Officer** | `safety@buildtrack.com` | `Safety@123456` |
| **Project Manager** | `pm@buildtrack.com` | `Manager@123456` |

---

## 🧪 Run Tests

To run the automated test suite (88 backend tests and 9 frontend tests; uses isolated `*_test` databases, never your dev data):
```bash
# Backend tests
cd backend
source .venv/bin/activate
pytest -v

# Frontend tests
cd ../frontend
npm test
```
