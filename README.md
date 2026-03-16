# Googloid Boundary Editor

A multi-user boundary editor for the Town of Southborough's Route 9 Corridor Development Impact Fee (DIF) district. Each registered user gets their own private copy of the DIF boundary to customize.

## Features

- **Self-service signup** — anyone can register with email + password
- **Per-user boundaries** — each user gets a private copy of the default DIF boundary
- **Interactive map editor** — drag vertices, add/delete points, undo history
- **Reset / Clear** — restore default boundary or start from scratch
- **Field-selectable PDF export** — choose which parcel data fields to include
- **Admin panel** — view all users, see who has custom boundaries, delete accounts
- **Street/Satellite toggle** — OpenStreetMap + Esri satellite imagery

## Tech Stack

- **Frontend**: React 18, Vite, Leaflet, Tailwind CSS, jsPDF
- **Backend**: Express.js (Node.js)
- **Data**: JSON files (per-user boundaries in `data/boundaries/`)
- **Deployment**: Nginx reverse proxy, systemd service

## Local Development

```bash
npm install
npm run dev        # Frontend on :5173, proxies API to :3001
node server.js     # Backend on :3001
```

## Deploy to Server

```bash
# On your server:
bash server/deploy.sh
```

Default admin credentials: `admin` / `admin` — change immediately after first login.

## Architecture

```
googloid-boundary-editor/
├── server.js              # Express API server
├── src/
│   ├── App.jsx            # Auth flow + routing
│   ├── BoundaryEditor.jsx # Map editor (core feature)
│   ├── AdminPanel.jsx     # Admin user management
│   ├── pdfExport.js       # PDF generation
│   ├── geometry.js        # Geo math utilities
│   └── parcelData.js      # 3,767 Southborough parcels
├── server/
│   ├── deploy.sh          # One-command deploy
│   ├── nginx-googloid.conf
│   └── googloid.service
└── data/                  # Created at runtime
    ├── users.json
    └── boundaries/        # One file per user
        ├── user1@email.json
        └── user2@email.json
```
